import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { imports, tiktokSyncImports } from "../db/schema";
import { commitImport, NothingToImportError, type ImportDiff } from "../data/imports";
import { checkRowCount } from "../integration/limits";
import { consolidateSyncHistory, KEEP_RECENT_SYNCS } from "./history";
import { MEASURE_LABEL } from "../metrics/availability";
import type { MeasureKey } from "../metrics/measures";
import type { TikTokMcpServer } from "./config";
import { TikTokMcp, TikTokMcpError } from "./mcp";
import { fetchTikTokCampaignDaily, normalizeTikTokReport, syncWindow, TIKTOK_MEASURES, TIKTOK_UNAVAILABLE, TikTokReportError } from "./report";
import { checkTikTokTarget, sameCurrency, tikTokAccessToken, TikTokConnectError, type Deps } from "./service";
import { acquireSyncLock, finishSync, holdSyncLock, listLinks, listSyncs, ownedWorkspace, readConnection, readSync, SYNC_BUDGET_MS } from "./store";

// Sync Now: reads one linked advertiser's last 30 complete days from TikTok
// (read-only) and imports them into the linked ad account as one report.
//
// - Ownership, the sample flag and the currency are re-checked on every sync.
// - One sync per ad account at a time, across servers: a lock with a per-run
//   token, re-checked inside the import transaction, so a run that ran out of
//   time can never write; plus a one-minute cooldown.
// - All pages are read (temporary failures retried, 4-minute budget) before
//   anything is written; one bad page writes nothing.
// - The import itself is one transaction (commitImport with syncScope): it
//   replaces stored data only where it brings TikTok's new number for the same
//   campaign and day, kept for undo. Unrelated campaigns, other uploads and summary
//   exports reaching outside the window are never hidden. Earlier reports are
//   never deleted or retired.
// - An empty report writes nothing, so it can never hide stored data.
// - Identical data to the last synced report (still active) writes nothing.
// - Only the newest syncs stay undoable; older ones become history in the same
//   transaction (lib/tiktok/history.ts). Syncs never count toward the upload limit.

export type TikTokSyncOutcome = "ok" | "unchanged" | "empty" | "skipped";

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
  // Rows left out because an uploaded multi-day report already covers those days.
  skipped: number;
  // Older syncs moved to history by this sync, and undo copies no longer reachable (counts only).
  history?: { retired: number; pruned: number };
  unavailable: { measure: MeasureKey; label: string; reason: string }[];
}

type SyncDeps = Deps & { sleep?: (ms: number) => Promise<void>; keepRecentSyncs?: number };

/** What a finished sync found, kept for the status poll (counts and dates only). */
export type TikTokSyncSummary = Pick<TikTokSyncResult, "outcome" | "window" | "period" | "rows" | "campaigns" | "currency" | "timezone" | "skipped" | "unavailable"> & { replaced: number };

/** Sync Now from start to finish in one call (tests; later the scheduler). */
export async function syncTikTokAdvertiser(userId: string, advertiserId: string, deps: SyncDeps = {}): Promise<TikTokSyncResult> {
  return (await startTikTokSync(userId, advertiserId, deps)).run();
}

/**
 * The quick part of Sync Now, answered to the person straight away: every check
 * and the lock. The returned `run` reads TikTok and writes (in the background on
 * Vercel, so no request is held open for minutes) and records the outcome with
 * a summary that the page polls for.
 */
export async function startTikTokSync(
  userId: string,
  advertiserId: string,
  deps: SyncDeps = {},
): Promise<{ window: { start: string; end: string }; run: () => Promise<TikTokSyncResult> }> {
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

  const lockToken = await acquireSyncLock(userId, advertiserId, link.workspaceId, now);
  if (!lockToken) throw new TikTokConnectError("busy");
  const finish = (result: Parameters<typeof finishSync>[3]) => finishSync(userId, link.workspaceId, lockToken, result, clock());
  const deadline = now.getTime() + SYNC_BUDGET_MS;
  const previous = await readSync(userId, link.workspaceId);
  const done = async (result: TikTokSyncResult, record: Parameters<typeof finishSync>[3]) => {
    await finish({ ...record, summary: summaryOf(result) });
    return result;
  };
  const run = async (): Promise<TikTokSyncResult> => {
  try {
    // A token that stays valid for the whole run (refreshed first if needed).
    const token = await tikTokAccessToken(userId, { ...deps, minValidMs: SYNC_BUDGET_MS + 5 * 60 * 1000 });
    const client = new TikTokMcp(connection.server as TikTokMcpServer, token, deps.fetcher);
    await client.initialize();
    const list = await fetchTikTokCampaignDaily(client, advertiserId, window, deps.sleep, deadline, () => clock().getTime());
    const report = normalizeTikTokReport(list, window);
    if (checkRowCount(report.rows.length)) throw new TikTokReportError("too_large", "Report too large");
    const base = {
      window,
      period: report.period,
      rows: report.rows.length,
      campaigns: new Set(report.rows.map((r) => r.campaignId)).size,
      currency,
      timezone: advertiser.timezone ?? "",
      skipped: 0,
      unavailable: unavailableMeasures(report.columns, report.rows.length > 0),
    };

    if (!report.period) {
      return done({ ...base, outcome: "empty", importId: null, diff: null }, { outcome: "empty", errorCode: null, rows: 0, periodStart: null, periodEnd: null });
    }

    const db = await getDb();
    if (previous?.fingerprint === report.fingerprint && previous.importId) {
      const [last] = await db.select({ status: imports.status }).from(imports).where(and(eq(imports.id, previous.importId), eq(imports.workspaceId, link.workspaceId)));
      if (last?.status === "active") {
        return done(
          { ...base, outcome: "unchanged", importId: previous.importId, diff: null },
          { outcome: "unchanged", errorCode: null, rows: report.rows.length, periodStart: report.period.start, periodEnd: report.period.end },
        );
      }
    }

    // Last check right before writing: the account may have been edited meanwhile.
    const ws = await ownedWorkspace(userId, link.workspaceId);
    if (!ws) throw new TikTokConnectError("workspace");
    if (ws.isSample) throw new TikTokConnectError("sample");
    if (!sameCurrency(ws.currency, currency)) throw new TikTokConnectError("currency");
    if (clock().getTime() > deadline) throw new TikTokReportError("timeout", "The sync took too long");

    let committed;
    let history = { retired: 0, pruned: 0 };
    try {
      committed = await commitImport(db, {
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
        syncScope: { window },
        onCommit: async (tx, importId) => {
          // Only the run that still holds the lock may write; otherwise everything rolls back.
          if (!(await holdSyncLock(tx, link.workspaceId, lockToken, clock()))) throw new TikTokConnectError("busy");
          await tx.insert(tiktokSyncImports).values({ importId, workspaceId: link.workspaceId, advertiserId, windowStart: window.start, windowEnd: window.end });
          history = await consolidateSyncHistory(tx, link.workspaceId, advertiserId, deps.keepRecentSyncs ?? KEEP_RECENT_SYNCS);
        },
      });
    } catch (error) {
      if (!(error instanceof NothingToImportError)) throw error;
      // Every returned day is already covered by an uploaded multi-day report that the sync keeps.
      return done(
        { ...base, outcome: "skipped", skipped: error.skipped, importId: null, diff: null },
        { outcome: "skipped", errorCode: null, rows: 0, periodStart: report.period.start, periodEnd: report.period.end },
      );
    }
    const { importId, diff, skipped } = committed;
    return done(
      { ...base, outcome: "ok", skipped, importId, diff, history },
      { outcome: "ok", errorCode: null, rows: report.rows.length - skipped, periodStart: report.period.start, periodEnd: report.period.end, importId, fingerprint: report.fingerprint },
    );
  } catch (error) {
    const code: TikTokConnectError["code"] =
      error instanceof TikTokConnectError
        ? error.code
        : error instanceof TikTokReportError
          ? error.code === "timeout" ? "timeout" : "report"
          : error instanceof TikTokMcpError
            ? "provider"
            : "storage"; // a database failure: the transaction rolled back, nothing changed
    // The previous fingerprint and import stay, so a later identical sync is still recognised.
    await finish({ outcome: "failed", errorCode: code, rows: null, periodStart: null, periodEnd: null, summary: null });
    throw new TikTokConnectError(code);
  }
  };
  return { window, run };
}

function summaryOf(r: TikTokSyncResult): TikTokSyncSummary {
  const { outcome, window, period, rows, campaigns, currency, timezone, skipped, unavailable } = r;
  return { outcome, window, period, rows, campaigns, currency, timezone, skipped, unavailable, replaced: r.diff?.replaced.length ?? 0 };
}

function unavailableMeasures(columns: MeasureKey[], hasRows: boolean) {
  const have = new Set(columns);
  const never = (Object.entries(TIKTOK_UNAVAILABLE) as [MeasureKey, string][]).map(([measure, reason]) => ({ measure, reason }));
  const missing = hasRows ? TIKTOK_MEASURES.filter((m) => !have.has(m.measure)).map((m) => ({ measure: m.measure, reason: "TikTok didn't report it for these dates" })) : [];
  return [...never, ...missing].map((u) => ({ ...u, label: MEASURE_LABEL[u.measure] }));
}

/**
 * Last sync per linked ad account, for the status display (no report numbers).
 * `interrupted`: the last run started but never recorded an outcome, and its lock
 * has run out, e.g. the platform stopped the function. Any write it began was
 * rolled back by the database, or finished in full; a new sync is safe either
 * way, since a sync never counts the same campaign-day twice.
 */
export async function tikTokSyncStatus(userId: string, now = new Date()) {
  return (await listSyncs(userId)).map((s) => {
    const running = !!s.lockedUntil && s.lockedUntil.getTime() > now.getTime();
    return {
    advertiserId: s.advertiserId,
    workspaceId: s.workspaceId,
    running,
    interrupted: !running && !!s.startedAt && (!s.finishedAt || s.startedAt.getTime() > s.finishedAt.getTime()),
    outcome: s.outcome,
    errorCode: s.errorCode,
    finishedAt: s.finishedAt?.toISOString() ?? null,
    rows: s.rows,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    summary: (s.summary as TikTokSyncSummary | null) ?? null,
    };
  });
}
