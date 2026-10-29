import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { imports } from "../db/schema";
import { commitImport, type ImportDiff } from "../data/imports";
import { checkImportLimit, checkRowCount } from "../integration/limits";
import { MEASURE_LABEL } from "../metrics/availability";
import type { MeasureKey } from "../metrics/measures";
import type { TikTokMcpServer } from "./config";
import { TikTokMcp } from "./mcp";
import { fetchTikTokCampaignDaily, normalizeTikTokReport, syncWindow, TIKTOK_MEASURES, TIKTOK_UNAVAILABLE, TikTokReportError } from "./report";
import { checkTikTokTarget, sameCurrency, tikTokAccessToken, TikTokConnectError, type Deps } from "./service";
import { acquireSyncLock, finishSync, listLinks, listSyncs, ownedWorkspace, readConnection, readSync } from "./store";

// Sync Now: reads one linked advertiser's last 30 complete days from TikTok
// (read-only) and imports them into the linked ad account as one report.
//
// - Ownership, the sample flag and the currency are re-checked on every sync.
// - One sync per ad account at a time, across servers (lock + one-minute cooldown).
// - All pages are read before anything is written; one bad page writes nothing.
// - The import itself is one transaction (commitImport): overlapping days from
//   earlier reports of this platform are replaced and kept for undo, exactly like
//   uploading a newer export. Earlier reports are never deleted or retired.
// - An empty report writes nothing, so it can never hide stored data, and the
//   replaced range is only the days TikTok actually returned.
// - Identical data to the last synced report (still active) writes nothing.

export type TikTokSyncOutcome = "ok" | "unchanged" | "empty";

export interface TikTokSyncResult {
  outcome: TikTokSyncOutcome;
  window: { start: string; end: string }; // dates asked for, advertiser time zone
  period: { start: string; end: string } | null; // dates TikTok returned data for
  rows: number;
  campaigns: number;
  currency: string;
  timezone: string;
  importId: string | null;
  diff: ImportDiff | null;
  unavailable: { measure: MeasureKey; label: string; reason: string }[];
}

export async function syncTikTokAdvertiser(userId: string, advertiserId: string, deps: Deps & { sleep?: (ms: number) => Promise<void> } = {}): Promise<TikTokSyncResult> {
  const link = (await listLinks(userId)).find((l) => l.advertiserId === advertiserId);
  if (!link) throw new TikTokConnectError("advertiser");
  const connection = await readConnection(userId);
  if (!connection) throw new TikTokConnectError("not_connected");
  const clock = deps.now ?? (() => new Date());
  const now = clock();

  // Re-checked live: still this person's real account, still authorized, same currency.
  const advertiser = await checkTikTokTarget(userId, advertiserId, link.workspaceId, deps);
  const currency = advertiser.currency!.toUpperCase();
  const window = syncWindow(advertiser.timezone, now);
  const full = await checkImportLimit(link.workspaceId);
  if (full) throw new TikTokConnectError("import_limit");

  if (!(await acquireSyncLock(userId, advertiserId, link.workspaceId, now))) throw new TikTokConnectError("busy");
  const previous = await readSync(userId, link.workspaceId);
  try {
    const token = await tikTokAccessToken(userId, deps);
    const client = new TikTokMcp(connection.server as TikTokMcpServer, token, deps.fetcher);
    await client.initialize();
    const report = normalizeTikTokReport(await fetchTikTokCampaignDaily(client, advertiserId, window, deps.sleep), window);
    if (checkRowCount(report.rows.length)) throw new TikTokReportError("too_large", "Report too large");
    const base = {
      window,
      period: report.period,
      rows: report.rows.length,
      campaigns: new Set(report.rows.map((r) => r.campaignId)).size,
      currency,
      timezone: advertiser.timezone ?? "",
      unavailable: unavailableMeasures(report.columns, report.rows.length > 0),
    };

    if (!report.period) {
      await finishSync(userId, link.workspaceId, { outcome: "empty", errorCode: null, rows: 0, periodStart: null, periodEnd: null }, clock());
      return { ...base, outcome: "empty", importId: null, diff: null };
    }

    const db = await getDb();
    if (previous?.fingerprint === report.fingerprint && previous.importId) {
      const [last] = await db.select({ status: imports.status }).from(imports).where(and(eq(imports.id, previous.importId), eq(imports.workspaceId, link.workspaceId)));
      if (last?.status === "active") {
        await finishSync(userId, link.workspaceId, { outcome: "unchanged", errorCode: null, rows: report.rows.length, periodStart: report.period.start, periodEnd: report.period.end }, clock());
        return { ...base, outcome: "unchanged", importId: previous.importId, diff: null };
      }
    }

    // Last check right before writing: the account may have been edited meanwhile.
    const ws = await ownedWorkspace(userId, link.workspaceId);
    if (!ws) throw new TikTokConnectError("workspace");
    if (ws.isSample) throw new TikTokConnectError("sample");
    if (!sameCurrency(ws.currency, currency)) throw new TikTokConnectError("currency");

    const { importId, diff } = await commitImport(db, {
      workspaceId: link.workspaceId,
      fileName: `TikTok sync · ${advertiser.name} · ${report.period.start} to ${report.period.end}`.slice(0, 200),
      platform: "tiktok",
      level: "campaign",
      granularity: "daily",
      period: report.period,
      currency,
      attribution: null,
      warnings: [
        `Synced read-only from TikTok. Amounts are in ${currency} and dates in the advertiser's time zone (${advertiser.timezone}), as TikTok reports them.`,
        ...base.unavailable.map((u) => `${u.label}: ${u.reason}.`),
      ],
      columns: report.columns,
      rows: report.rows,
    });
    await finishSync(userId, link.workspaceId, {
      outcome: "ok", errorCode: null, rows: report.rows.length, periodStart: report.period.start, periodEnd: report.period.end, importId, fingerprint: report.fingerprint,
    }, clock());
    return { ...base, outcome: "ok", importId, diff };
  } catch (error) {
    const code: TikTokConnectError["code"] = error instanceof TikTokConnectError ? error.code : error instanceof TikTokReportError ? "report" : "provider";
    // The previous fingerprint and import stay, so a later identical sync is still recognised.
    await finishSync(userId, link.workspaceId, { outcome: "failed", errorCode: code, rows: null, periodStart: null, periodEnd: null }, clock());
    throw new TikTokConnectError(code);
  }
}

function unavailableMeasures(columns: MeasureKey[], hasRows: boolean) {
  const have = new Set(columns);
  const never = (Object.entries(TIKTOK_UNAVAILABLE) as [MeasureKey, string][]).map(([measure, reason]) => ({ measure, reason }));
  const missing = hasRows ? TIKTOK_MEASURES.filter((m) => !have.has(m.measure)).map((m) => ({ measure: m.measure, reason: "TikTok didn't report it for these dates" })) : [];
  return [...never, ...missing].map((u) => ({ ...u, label: MEASURE_LABEL[u.measure] }));
}

/** Last sync per linked ad account, for the status display (no report numbers). */
export async function tikTokSyncStatus(userId: string) {
  return (await listSyncs(userId)).map((s) => ({
    advertiserId: s.advertiserId,
    workspaceId: s.workspaceId,
    running: !!s.lockedUntil && s.lockedUntil.getTime() > Date.now(),
    outcome: s.outcome,
    errorCode: s.errorCode,
    finishedAt: s.finishedAt?.toISOString() ?? null,
    rows: s.rows,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
  }));
}
