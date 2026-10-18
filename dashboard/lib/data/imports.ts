import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { DB } from "../db/client";
import { breakdowns, entities, entityAliases, facts, imports } from "../db/schema";
import { emptyMeasures, MEASURE_KEYS, sumMeasures, type MeasureKey, type Measures } from "../metrics/measures";
import type { Objective } from "../metrics/objectives";
import type { Platform } from "../ingest/headers";
import { nameKey } from "../ingest/match";
import type { Granularity, Level, NormalizedRow } from "../ingest/normalize";
import type { BreakdownKind } from "../ingest/breakdown";

export interface CommitArgs {
  workspaceId: string;
  fileName: string;
  platform: Platform;
  level: Level;
  granularity: Granularity;
  period: { start: string; end: string };
  currency: string | null;
  attribution: string | null;
  warnings: string[];
  // Measures the export contained (see ImportPreview.measuresPresent).
  columns: MeasureKey[];
  rows: NormalizedRow[];
  // campaign name → objective chosen by the user in the preview
  objectiveOverrides?: Record<string, Objective>;
  // incoming campaign name → existing campaign entity id (confirmed fuzzy matches)
  matches?: Record<string, string>;
  // A breakdown export for Audience insight: stored in `breakdowns`, never in `facts`.
  breakdown?: BreakdownKind | null;
}

export interface ImportDiff {
  replaced: { id: string; fileName: string; periodStart: string; periodEnd: string }[];
  before: { spend: number; impressions: number };
  after: { spend: number; impressions: number };
}

type EntityRow = typeof entities.$inferSelect;

// Import normalized rows. Overlapping data from earlier uploads of the same
// platform is replaced (newest wins) and kept for undo (PRD F3).
export async function commitImport(db: DB, args: CommitArgs): Promise<{ importId: string; diff: ImportDiff | null }> {
  const importId = randomUUID();
  const { workspaceId, platform, period } = args;

  return db.transaction(async (tx) => {
    await tx.insert(imports).values({
      id: importId, workspaceId, platform, fileName: args.fileName, level: args.level, granularity: args.granularity,
      periodStart: period.start, periodEnd: period.end, rowCount: args.rows.length, currency: args.currency,
      attribution: args.attribution, warnings: args.warnings, columns: args.columns, kind: args.breakdown ?? "performance",
    });

    // ---------- resolve entities ----------
    const existing = await tx.select().from(entities).where(and(eq(entities.workspaceId, workspaceId), eq(entities.platform, platform)));
    const aliases = await tx.select().from(entityAliases).where(and(eq(entityAliases.workspaceId, workspaceId), eq(entityAliases.platform, platform)));
    const byId = new Map(existing.map((e) => [e.id, e]));
    const byExt = new Map(existing.filter((e) => e.externalId).map((e) => [`${e.level}|${e.externalId}`, e]));
    const byKey = new Map(existing.map((e) => [`${e.level}|${e.parentId ?? ""}|${e.nameKey}`, e]));
    for (const al of aliases) {
      const e = byId.get(al.entityId);
      if (e) byKey.set(`${al.level}|${e.parentId ?? ""}|${al.nameKey}`, e);
    }
    const touched = new Map<string, EntityRow>();
    const created: EntityRow[] = [];
    const newAliases: (typeof entityAliases.$inferInsert)[] = [];

    // Campaign objective = the objective carrying the most spend across its rows.
    const campaignObjective = new Map<string, { objective: Objective; source: string }>();
    {
      const weights = new Map<string, Map<string, { spend: number; source: string }>>();
      for (const r of args.rows) {
        const w = weights.get(r.campaign) ?? new Map();
        const cur = w.get(r.objective) ?? { spend: 0, source: r.objectiveSource };
        cur.spend += r.measures.spend + 1e-9;
        w.set(r.objective, cur);
        weights.set(r.campaign, w);
      }
      for (const [name, w] of weights) {
        const [obj, v] = [...w.entries()].sort((x, y) => y[1].spend - x[1].spend)[0];
        campaignObjective.set(name, { objective: obj as Objective, source: v.source });
      }
      for (const [name, obj] of Object.entries(args.objectiveOverrides ?? {})) {
        campaignObjective.set(name, { objective: obj, source: "user" });
      }
    }

    function resolve(level: Level, parentId: string | null, extId: string | null, name: string, row: NormalizedRow, day: { start: string; end: string }): EntityRow {
      const key = nameKey(name);
      let e =
        (extId ? byExt.get(`${level}|${extId}`) : undefined) ??
        byKey.get(`${level}|${parentId ?? ""}|${key}`) ??
        (level === "campaign" && args.matches?.[name] ? byId.get(args.matches[name]) : undefined);
      const obj = campaignObjective.get(row.campaign) ?? { objective: row.objective, source: row.objectiveSource };
      if (!e) {
        e = {
          id: randomUUID(), workspaceId, platform, level, parentId, externalId: extId, name, nameKey: key,
          objective: obj.objective, objectiveSource: obj.source, role: null, status: row.status, secondaryStatus: row.secondaryStatus,
          budget: row.budget, firstSeen: day.start, lastSeen: day.end,
        };
        created.push(e);
        byId.set(e.id, e);
      } else {
        e = touched.get(e.id) ?? { ...e };
        if (level === "campaign" && args.matches?.[name] && e.nameKey !== key) {
          newAliases.push({ workspaceId, platform, level, nameKey: key, entityId: e.id });
        }
        if (e.objectiveSource !== "user" || obj.source === "user") {
          e.objective = obj.objective;
          e.objectiveSource = obj.source;
        }
        if (day.end >= e.lastSeen) {
          e.status = row.status ?? e.status;
          e.secondaryStatus = row.secondaryStatus;
          e.budget = row.budget ?? e.budget;
          e.name = name;
          e.lastSeen = day.end;
        }
        if (day.start < e.firstSeen) e.firstSeen = day.start;
        if (!e.externalId && extId) e.externalId = extId;
        if (!created.includes(e)) touched.set(e.id, e);
      }
      if (extId) byExt.set(`${level}|${extId}`, e);
      byKey.set(`${level}|${parentId ?? ""}|${key}`, e);
      return e;
    }

    if (args.breakdown) {
      const kind = args.breakdown;
      // One row per campaign, group and period (ad set / ad rows are added up).
      const acc = new Map<string, typeof breakdowns.$inferInsert & { m: Measures }>();
      for (const r of args.rows) {
        const day = { start: r.date ?? period.start, end: r.date ?? period.end };
        const camp = resolve("campaign", null, r.campaignId, r.campaign, r, day);
        const segment = r.segment ?? "Unknown";
        const k = `${camp.id}|${segment}|${day.start}|${day.end}`;
        const cur = acc.get(k) ?? { workspaceId, importId, platform, kind, segment, campaignId: camp.id, periodStart: day.start, periodEnd: day.end, measures: {}, m: emptyMeasures() };
        cur.m = sumMeasures([cur.m, r.measures]);
        acc.set(k, cur);
      }
      for (let i = 0; i < created.length; i += 500) await tx.insert(entities).values(created.slice(i, i + 500));
      for (const e of touched.values()) {
        const { id, ...rest } = e;
        await tx.update(entities).set(rest).where(eq(entities.id, id));
      }
      // Newest upload of the same kind wins on overlap (kept for undo).
      await tx
        .update(breakdowns)
        .set({ active: false, replacedBy: importId })
        .where(and(eq(breakdowns.workspaceId, workspaceId), eq(breakdowns.platform, platform), eq(breakdowns.kind, kind), eq(breakdowns.active, true), lte(breakdowns.periodStart, period.end), gte(breakdowns.periodEnd, period.start)));
      const values = [...acc.values()].map(({ m, ...v }) => ({ ...v, measures: m }));
      for (let i = 0; i < values.length; i += 1000) await tx.insert(breakdowns).values(values.slice(i, i + 1000));
      return { importId, diff: null };
    }

    const factRows: (typeof facts.$inferInsert)[] = [];
    for (const r of args.rows) {
      const day = { start: r.date ?? period.start, end: r.date ?? period.end };
      const camp = resolve("campaign", null, r.campaignId, r.campaign, r, day);
      const group = r.adGroup ? resolve("ad_group", camp.id, r.adGroupId, r.adGroup, r, day) : null;
      const ad = r.ad ? resolve("ad", group?.id ?? camp.id, r.adId, r.ad, r, day) : null;
      factRows.push({
        workspaceId, importId, platform, campaignId: camp.id, adGroupId: group?.id ?? null, adId: ad?.id ?? null,
        granularity: args.granularity, periodStart: day.start, periodEnd: day.end, ...r.measures,
      });
    }

    for (let i = 0; i < created.length; i += 500) await tx.insert(entities).values(created.slice(i, i + 500));
    for (const e of touched.values()) {
      const { id, ...rest } = e;
      await tx.update(entities).set(rest).where(eq(entities.id, id));
    }
    if (newAliases.length) await tx.insert(entityAliases).values(newAliases).onConflictDoNothing();

    // ---------- newest upload wins on overlap ----------
    const overlapping = await tx
      .select()
      .from(facts)
      .where(and(eq(facts.workspaceId, workspaceId), eq(facts.platform, platform), eq(facts.active, true), lte(facts.periodStart, period.end), gte(facts.periodEnd, period.start)));
    let diff: ImportDiff | null = null;
    if (overlapping.length) {
      const replacedIds = [...new Set(overlapping.map((f) => f.importId))];
      const replacedImports = await tx.select().from(imports).where(inArray(imports.id, replacedIds));
      const minStart = overlapping.reduce((m, f) => (f.periodStart < m ? f.periodStart : m), period.end);
      const maxEnd = overlapping.reduce((m, f) => (f.periodEnd > m ? f.periodEnd : m), period.start);
      const before = sumMeasures(overlapping.map(toMeasures));
      const after = sumMeasures(factRows.filter((f) => f.periodStart! >= minStart && f.periodEnd! <= maxEnd).map((f) => toMeasures(f as FactLike)));
      diff = {
        replaced: replacedImports.map((i) => ({ id: i.id, fileName: i.fileName, periodStart: i.periodStart, periodEnd: i.periodEnd })),
        before: { spend: before.spend, impressions: before.impressions },
        after: { spend: after.spend, impressions: after.impressions },
      };
      const ids = overlapping.map((f) => f.id);
      for (let i = 0; i < ids.length; i += 1000) {
        await tx.update(facts).set({ active: false, replacedBy: importId }).where(inArray(facts.id, ids.slice(i, i + 1000)));
      }
      await tx.update(imports).set({ diff }).where(eq(imports.id, importId));
    }

    for (let i = 0; i < factRows.length; i += 1000) await tx.insert(facts).values(factRows.slice(i, i + 1000));
    return { importId, diff };
  });
}

type FactLike = Partial<Record<(typeof MEASURE_KEYS)[number], number | null>>;

function toMeasures(f: FactLike): Measures {
  const m = emptyMeasures();
  for (const k of MEASURE_KEYS) m[k] = Number(f[k] ?? 0);
  return m;
}

// Undo an upload: remove its data and bring back what it replaced.
export async function undoImport(db: DB, workspaceId: string, importId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [imp] = await tx.select().from(imports).where(and(eq(imports.id, importId), eq(imports.workspaceId, workspaceId)));
    if (!imp || imp.status !== "active") return;
    await tx.delete(facts).where(eq(facts.importId, importId));
    await tx.update(facts).set({ active: true, replacedBy: null }).where(eq(facts.replacedBy, importId));
    await tx.delete(breakdowns).where(eq(breakdowns.importId, importId));
    await tx.update(breakdowns).set({ active: true, replacedBy: null }).where(eq(breakdowns.replacedBy, importId));
    await tx.update(imports).set({ status: "undone" }).where(eq(imports.id, importId));
  });
}
