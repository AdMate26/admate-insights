import "server-only";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { getDb } from "../db/client";
import { breakdowns, entities, facts, goals, imports, recStatus, workspaces } from "../db/schema";
import { addDays, toISO } from "../dates";
import { emptyMeasures, MEASURE_KEYS, sumMeasures, type MeasureKey, type Measures } from "../metrics/measures";
import { ALL_MEASURES, intersectAvail, kpiAvailable, type Avail } from "../metrics/availability";
import { kpiLabel, kpiValue, resultCount, type KpiMode } from "../metrics/objectives";
import { performanceIndex } from "../analysis/goals";
import { advantage } from "../analysis/wording";
import { money, shortDate } from "../format";
import type { Objective } from "../metrics/objectives";
import type { Platform } from "../ingest/headers";
import { analyze } from "../analysis/analyze";
import { isRole } from "../analysis/roles";
import type { Goal } from "../analysis/goals";
import { resolveSelection, type Coverage, type SelectionParams } from "../analysis/periods";
import type { Analysis, CampaignInfo, DoneItem, EntityLevel, FactRow, Finding, FindingStatus } from "../analysis/types";

// Every account read starts here and only ever sees the signed-in user's own
// accounts. loadAnalysis goes through getWorkspace, so it is covered too.
export async function listWorkspaces() {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = await getDb();
  return db.select().from(workspaces).where(eq(workspaces.ownerId, user.id)).orderBy(workspaces.createdAt);
}

export async function getWorkspace(id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(and(eq(workspaces.id, id), eq(workspaces.ownerId, user.id)));
  return ws ?? null;
}

// For server actions and pages that read or write an account directly: stops
// with a 404 unless the account belongs to the signed-in user.
export async function requireWorkspace(id: string) {
  const ws = await getWorkspace(id);
  if (!ws) notFound();
  return ws;
}

export async function getGoals(workspaceId: string): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.select().from(goals).where(eq(goals.workspaceId, workspaceId));
  return rows.map((g) => ({
    objective: g.objective as Objective,
    target: g.target,
    marginPct: g.marginPct,
    leadToCustomerPct: g.leadToCustomerPct,
    profitPerCustomer: g.profitPerCustomer,
  }));
}

export async function listImports(workspaceId: string) {
  const db = await getDb();
  return db.select().from(imports).where(eq(imports.workspaceId, workspaceId)).orderBy(desc(imports.createdAt));
}

export async function getCoverage(workspaceId: string): Promise<Coverage> {
  const db = await getDb();
  const [agg] = await db
    .select({
      minDate: sql<string | null>`min(${facts.periodStart})`,
      maxDate: sql<string | null>`max(${facts.periodEnd})`,
      dailyFrom: sql<string | null>`min(case when ${facts.granularity} = 'daily' then ${facts.periodStart} end)`,
      dailyTo: sql<string | null>`max(case when ${facts.granularity} = 'daily' then ${facts.periodEnd} end)`,
    })
    .from(facts)
    .where(and(eq(facts.workspaceId, workspaceId), eq(facts.active, true)));
  // Every upload that still has live data is a report the user can compare.
  const reports = await db
    .selectDistinct({
      importId: imports.id, platform: imports.platform, from: imports.periodStart, to: imports.periodEnd,
      fileName: imports.fileName, granularity: imports.granularity, createdAt: imports.createdAt,
      currency: imports.currency, attribution: imports.attribution,
    })
    .from(imports)
    .innerJoin(facts, and(eq(facts.importId, imports.id), eq(facts.active, true)))
    .where(and(eq(imports.workspaceId, workspaceId), eq(imports.status, "active")))
    .orderBy(desc(imports.periodEnd), desc(imports.createdAt));
  const snaps = reports.filter((r) => r.granularity === "snapshot");
  const iso = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v.slice(0, 10) : toISO(v as Date));
  return {
    hasData: !!agg?.minDate,
    hasDaily: !!agg?.dailyFrom,
    minDate: iso(agg?.minDate),
    maxDate: iso(agg?.maxDate),
    dailyFrom: iso(agg?.dailyFrom),
    dailyTo: iso(agg?.dailyTo),
    snapshots: snaps.map((s) => ({ importId: s.importId, platform: s.platform, from: s.from, to: s.to, fileName: s.fileName })),
    reports: reports.map((r) => ({
      importId: r.importId, platform: r.platform, from: r.from, to: r.to, fileName: r.fileName,
      granularity: r.granularity as "daily" | "snapshot", currency: r.currency, attribution: r.attribution,
      uploadedAt: iso(r.createdAt),
    })),
  };
}

export async function loadFacts(workspaceId: string, from: string, to: string, importId?: string): Promise<FactRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.workspaceId, workspaceId),
        eq(facts.active, true),
        gte(facts.periodStart, from),
        lte(facts.periodEnd, to),
        importId ? eq(facts.importId, importId) : undefined,
      ),
    );
  return rows.map((f) => {
    const m = emptyMeasures();
    for (const k of MEASURE_KEYS) m[k] = Number(f[k]);
    return {
      importId: f.importId,
      campaignId: f.campaignId,
      adGroupId: f.adGroupId,
      adId: f.adId,
      platform: f.platform as Platform,
      granularity: f.granularity as FactRow["granularity"],
      periodStart: f.periodStart,
      periodEnd: f.periodEnd,
      measures: m,
    };
  });
}

// Breakdown rows (Audience insight) of one kind: the rows inside the period, or,
// when there are none, the newest upload of that kind (the page says which dates).
export async function loadBreakdowns(workspaceId: string, kind: string, from: string, to: string) {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  const all = await db
    .select()
    .from(breakdowns)
    .where(and(eq(breakdowns.workspaceId, workspaceId), eq(breakdowns.kind, kind), eq(breakdowns.active, true)));
  const toRow = (b: (typeof all)[number]) => ({ campaignId: b.campaignId, segment: b.segment, from: b.periodStart, to: b.periodEnd, measures: { ...emptyMeasures(), ...(b.measures as Partial<Measures>) } });
  const inside = all.filter((b) => b.periodStart >= from && b.periodEnd <= to);
  if (inside.length) return { rows: inside.map(toRow), inPeriod: true };
  if (!all.length) return { rows: [], inPeriod: false };
  const newest = all.reduce((m, b) => (b.periodEnd > m ? b.periodEnd : m), all[0].periodEnd);
  const latestImport = all.filter((b) => b.periodEnd === newest)[0].importId;
  return { rows: all.filter((b) => b.importId === latestImport).map(toRow), inPeriod: false };
}

// Daily rows for one campaign / ad set / ad (for its day-by-day chart).
export async function loadEntityDaily(workspaceId: string, level: EntityLevel, id: string, from: string, to: string): Promise<FactRow[]> {
  await requireWorkspace(workspaceId);
  const db = await getDb();
  const col = level === "campaign" ? facts.campaignId : level === "ad_group" ? facts.adGroupId : facts.adId;
  const rows = await db
    .select()
    .from(facts)
    .where(and(eq(facts.workspaceId, workspaceId), eq(facts.active, true), eq(facts.granularity, "daily"), eq(col, id), gte(facts.periodStart, from), lte(facts.periodEnd, to)));
  return rows.map((f) => {
    const m = emptyMeasures();
    for (const k of MEASURE_KEYS) m[k] = Number(f[k]);
    return { importId: f.importId, campaignId: f.campaignId, adGroupId: f.adGroupId, adId: f.adId, platform: f.platform as Platform, granularity: "daily", periodStart: f.periodStart, periodEnd: f.periodEnd, measures: m };
  });
}

// Measures each upload actually contains. Uploads made before this was recorded
// fall back to "columns with at least one non-zero value" (a column of all zeros
// is almost always a column the export didn't have).
export async function loadImportColumns(workspaceId: string): Promise<Map<string, Avail>> {
  const db = await getDb();
  const rows = await db.select({ id: imports.id, columns: imports.columns }).from(imports).where(eq(imports.workspaceId, workspaceId));
  const out = new Map<string, Avail>();
  const legacy: string[] = [];
  for (const r of rows) {
    if (r.columns) out.set(r.id, new Set(r.columns as MeasureKey[]));
    else legacy.push(r.id);
  }
  if (legacy.length) {
    const nonZero = Object.fromEntries(MEASURE_KEYS.map((k) => [k, sql<boolean>`bool_or(${facts[k]} <> 0)`]));
    const agg = await db
      .select({ importId: facts.importId, ...nonZero })
      .from(facts)
      .where(and(eq(facts.workspaceId, workspaceId), inArray(facts.importId, legacy)))
      .groupBy(facts.importId);
    for (const a of agg) {
      const rec = a as unknown as Record<string, unknown>;
      out.set(a.importId, new Set(MEASURE_KEYS.filter((k) => rec[k] === true)));
    }
  }
  return out;
}

export async function loadCampaigns(workspaceId: string): Promise<CampaignInfo[]> {
  const db = await getDb();
  const rows = await db.select().from(entities).where(and(eq(entities.workspaceId, workspaceId), eq(entities.level, "campaign")));
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    platform: e.platform as Platform,
    objective: e.objective as Objective,
    objectiveSource: e.objectiveSource,
    status: e.status,
    secondaryStatus: e.secondaryStatus,
    budget: e.budget,
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    role: isRole(e.role) ? e.role : null,
  }));
}

// Ad sets / ad groups and ads. Their objective always follows their campaign
// (so an objective override on the campaign applies to everything under it).
export async function loadLowerEntities(workspaceId: string): Promise<CampaignInfo[]> {
  const db = await getDb();
  const rows = await db.select().from(entities).where(eq(entities.workspaceId, workspaceId));
  const byId = new Map(rows.map((e) => [e.id, e]));
  const campaignOf = (id: string | null): (typeof rows)[number] | undefined => {
    let e = id ? byId.get(id) : undefined;
    while (e && e.level !== "campaign") e = e.parentId ? byId.get(e.parentId) : undefined;
    return e;
  };
  return rows
    .filter((e) => e.level !== "campaign")
    .map((e) => {
      const campaign = campaignOf(e.parentId);
      const parent = e.parentId ? byId.get(e.parentId) : undefined;
      return {
        id: e.id,
        name: e.name,
        platform: e.platform as Platform,
        objective: (campaign?.objective ?? e.objective) as Objective,
        objectiveSource: campaign?.objectiveSource ?? e.objectiveSource,
        status: e.status,
        secondaryStatus: e.secondaryStatus,
        budget: e.budget,
        firstSeen: e.firstSeen,
        lastSeen: e.lastSeen,
        level: e.level as "ad_group" | "ad",
        campaignId: campaign?.id,
        parentName: parent?.name ?? null,
        parentId: e.parentId,
      };
    });
}

// Full analysis for one workspace and the selected period (from URL params).
export async function loadAnalysis(workspaceId: string, params: SelectionParams = {}): Promise<Analysis | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const coverage = await getCoverage(workspaceId);
  const selection = resolveSelection(params, coverage);
  if (!selection) return null;

  // In report mode each side is exactly one uploaded file, whatever else overlaps its dates.
  const reportB = selection.reports?.b.importId;
  const reportA = selection.reports?.a?.importId;
  const [goalRows, campaigns, lowerEntities, factsB, factsA, recentDaily, statuses, columns, factsHistory] = await Promise.all([
    getGoals(workspaceId),
    loadCampaigns(workspaceId),
    loadLowerEntities(workspaceId),
    loadFacts(workspaceId, selection.b.from, selection.b.to, reportB),
    selection.a ? loadFacts(workspaceId, selection.a.from, selection.a.to, reportA) : Promise.resolve([]),
    coverage.hasDaily ? loadFacts(workspaceId, addDays(selection.b.to, -27), selection.b.to, reportB) : Promise.resolve([]),
    getDb().then((db) => db.select().from(recStatus).where(eq(recStatus.workspaceId, workspaceId))),
    loadImportColumns(workspaceId),
    // The items' own past results: everything uploaded before the period.
    loadFacts(workspaceId, "1900-01-01", addDays(selection.b.from, -1)),
  ]);

  const analysis = analyze({
    workspace: { id: ws.id, name: ws.name, currency: ws.currency },
    goals: goalRows,
    campaigns,
    entities: lowerEntities,
    coverage,
    selection,
    factsB,
    factsA,
    recentDaily: recentDaily.filter((f) => f.granularity === "daily"),
    factsHistory,
    columns,
    // The sample is simulated without attribution delay, so its recent days are complete.
    maturityDays: ws.isSample ? 0 : undefined,
  });

  // Merge the user's decisions (done / dismissed / snoozed) into the findings.
  // "accepted" is from the earlier inbox and now simply means "to do".
  const today = toISO(new Date());
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  for (const s of statuses) {
    if (s.status === "accepted") continue;
    if (s.status === "snoozed" && s.snoozeUntil && s.snoozeUntil <= today) continue;
    analysis.decisions[s.key] = { status: s.status as FindingStatus, dismissReason: s.dismissReason, until: s.status === "snoozed" ? s.snoozeUntil : null };
  }
  for (const f of analysis.findings) {
    const s = byKey.get(f.key);
    if (!s || s.status === "accepted") continue;
    if (s.status === "snoozed" && s.snoozeUntil && s.snoozeUntil <= today) continue;
    f.status = s.status as FindingStatus;
    f.dismissReason = s.dismissReason;
  }
  analysis.done = await loadDoneItems(workspaceId, statuses, coverage, columns);
  return analysis;
}

// What AdMate stores when a finding is marked done, to re-check it later.
export interface Baseline {
  level: EntityLevel;
  entityId: string;
  objective: Objective;
  mode: KpiMode;
  kpiLabel: string;
  kpi: number;
  periodEnd: string;
}

export function baselineFor(f: Finding, a: Analysis): Baseline | null {
  if (f.level === "account" || !f.entityId) return null;
  const rows = f.level === "campaign" ? a.campaigns : a.byLevel[f.level];
  const row = rows.find((r) => r.info.id === f.entityId);
  if (!row || row.kpiB === null) return null;
  return { level: f.level, entityId: row.info.id, objective: row.info.objective, mode: row.mode, kpiLabel: kpiLabel(row.info.objective, row.mode), kpi: row.kpiB, periodEnd: a.selection.b.to };
}

// "Did it work?": compare the item's KPI in data after the day it was marked
// done with its KPI when it was marked done.
async function loadDoneItems(workspaceId: string, statuses: (typeof recStatus.$inferSelect)[], coverage: Coverage, columns: Map<string, Avail>): Promise<DoneItem[]> {
  const ws = await getWorkspace(workspaceId);
  const cur = ws?.currency ?? "USD";
  const fmt = (v: number, mode: KpiMode) => (mode === "roas" ? `${v.toFixed(2)}×` : money(v, cur));
  const out: DoneItem[] = [];
  const done = statuses.filter((s) => s.status === "done" && s.doneAt).sort((x, y) => (y.doneAt! > x.doneAt! ? 1 : -1)).slice(0, 10);
  for (const s of done) {
    const recheckDays = Number((s.baseline as { recheckDays?: number } | null)?.recheckDays ?? 7);
    const base = s.baseline as (Baseline & { recheckDays?: number }) | null;
    const item: DoneItem = { key: s.key, title: s.title ?? s.key, doneAt: s.doneAt!, recheckDays, outcome: { state: "waiting", text: "" } };
    const recheckOn = addDays(s.doneAt!, recheckDays);
    if (!base) {
      item.outcome = { state: "not_enough_data", text: "AdMate can't re-check this one automatically; compare the numbers yourself after your next upload." };
    } else if (!coverage.maxDate || coverage.maxDate < recheckOn) {
      item.outcome = { state: "waiting", text: `Re-check after ${shortDate(recheckOn)}: upload data that covers the days after you made the change.` };
    } else {
      const after = (await loadFacts(workspaceId, addDays(s.doneAt!, 1), coverage.maxDate)).filter((f) =>
        base.level === "campaign" ? f.campaignId === base.entityId : base.level === "ad_group" ? f.adGroupId === base.entityId : f.adId === base.entityId,
      );
      const m = sumMeasures(after.map((f) => f.measures));
      const avail = intersectAvail(after.map((f) => (f.importId ? columns.get(f.importId) : undefined) ?? ALL_MEASURES));
      const kpi = kpiAvailable(base.objective, base.mode, avail) ? kpiValue(m, base.objective, base.mode) : null;
      const volume = base.mode === "cpm" ? m.impressions >= 1000 : resultCount(m, base.objective) >= 10;
      if (kpi === null || !volume) {
        item.outcome = { state: "not_enough_data", text: `Not enough data since ${shortDate(s.doneAt!)} to judge yet (${money(m.spend, cur)} spent).` };
      } else {
        const pi = performanceIndex(kpi, base.kpi, base.mode)!;
        const state = pi >= 1.05 ? "improved" : pi <= 0.95 ? "worse" : "no_change";
        item.outcome = {
          state,
          text: `${base.kpiLabel} ${fmt(base.kpi, base.mode)} before → ${fmt(kpi, base.mode)} since ${shortDate(s.doneAt!)} (${state === "no_change" ? "about the same" : advantage(pi, base.mode)}).`,
        };
      }
    }
    out.push(item);
  }
  return out;
}
