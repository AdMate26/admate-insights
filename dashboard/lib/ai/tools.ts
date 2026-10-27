import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatValue, money, num, pct, signedPct } from "../format";
import { METRICS, metricAvailable, type MetricKey } from "../metrics/metrics";
import { kpiLabel, OBJECTIVE_DEFS, OBJECTIVES, resultCount, type KpiMode } from "../metrics/objectives";
import { emptyMeasures, sumMeasures } from "../metrics/measures";
import { PLATFORM_LABEL } from "../ingest/headers";
import { LEVEL_WORD, reasonsFor } from "../analysis/compare";
import { dataBasis } from "../analysis/detectors";
import { performanceIndex } from "../analysis/goals";
import { computePlan } from "../analysis/plan";
import { advantage } from "../analysis/wording";
import type { Analysis, CampaignRow, EntityLevel, Finding } from "../analysis/types";
import { rangeDays } from "../dates";
import { getWorkspace, loadFacts } from "../data/workspaces";
import { loadGeography } from "../data/geography";

// Read-only tools the assistant uses to look at the account. Every number they
// return is computed and formatted by AdMate's engine, so the answer can quote
// it exactly; the model never has to calculate.

type Json = Record<string, unknown>;

const LEVELS = ["campaign", "ad_group", "ad"] as const;

const DEFS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_overview",
    description:
      "Overview of the account for the selected period: spend, each objective's main KPI with its change and confidence, goal status (vs target, or vs previous period when no target), spend by platform, campaigns that started or stopped, data notes (missing columns, incomplete data), and how many findings are in each bucket. Start here for general questions.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_findings",
    description:
      "The issues and opportunities AdMate detected, ranked. Each has an id, title, bucket (attention = something wrong, opportunity = something working, monitor = early signal without enough data), priority, money at stake and a one-line summary. Use get_finding for the full evidence.",
    input_schema: {
      type: "object",
      properties: { bucket: { type: "string", enum: ["attention", "opportunity", "monitor", "all"], description: "Which bucket to list. Default: all." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_finding",
    description:
      "Everything about one finding: what happened, why it matters, likely cause (a hypothesis), the evidence numbers (before → after), recommended action, risk, re-check rule, why it has its priority, the rule that flagged it, and the data it's based on.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "Finding id from list_findings." } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "find_items",
    description:
      "Search campaigns, ad sets or ads. Returns id, name, objective, spend, main KPI with change, and AdMate's assessment for each (better / as / worse than expected, with priority). Use to answer 'which campaign/ad is best/worst/most expensive' or to find an item by name.",
    input_schema: {
      type: "object",
      properties: {
        level: { type: "string", enum: [...LEVELS], description: "campaign (default), ad_group (ad sets / ad groups) or ad." },
        name_contains: { type: "string", description: "Case-insensitive part of the name." },
        objective: { type: "string", enum: [...OBJECTIVES] },
        sort: { type: "string", enum: ["spend", "kpi_worse", "kpi_better", "best_performer", "worst_performer"], description: "spend (default); kpi_worse/kpi_better = biggest change vs the comparison period; best/worst_performer = KPI vs target or similar items." },
        limit: { type: "integer", description: "Max items (default 10, max 25)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_item",
    description:
      "Full numbers for one campaign, ad set or ad: every metric in both periods with its change (or 'not in export'), the KPI vs target and vs similar items, AdMate's assessment, next step and why (the same as the Recommendations page), confidence and data basis, its findings, and its biggest ad sets/ads.",
    input_schema: {
      type: "object",
      properties: { level: { type: "string", enum: [...LEVELS] }, id: { type: "string" } },
      required: ["level", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_items",
    description: "Compare two items of the same level (e.g. two campaigns): both sets of numbers and, when they share an objective, which is better and the main reasons why (from the KPI breakdown into CPM, CTR, conversion rate).",
    input_schema: {
      type: "object",
      properties: { level: { type: "string", enum: [...LEVELS] }, id_a: { type: "string" }, id_b: { type: "string" } },
      required: ["level", "id_a", "id_b"],
      additionalProperties: false,
    },
  },
  {
    name: "get_daily",
    description: "Day-by-day spend, results and KPI for the last 28 days of the period, for one campaign or (without campaign_id) for one objective. Only available when the uploads have a daily breakdown.",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" }, objective: { type: "string", enum: [...OBJECTIVES] } },
      additionalProperties: false,
    },
  },
  {
    name: "get_locations",
    description:
      "Where the money went by location (country, region or city) across all campaigns: spend and share of spend per location. Then, for one objective (default: the biggest with enough results), each location's spend, results, share of results, cost per result (or ROAS) and AdMate's verdict (best value, costly, as expected, too little data). Says when the numbers are a simulated split (the sample account) or when no location export was uploaded. Use for questions about places, regions or cities.",
    input_schema: {
      type: "object",
      properties: { objective: { type: "string", enum: [...OBJECTIVES] } },
      additionalProperties: false,
    },
  },
];

// Tool inputs stream as they are generated; runTool validates each one.
export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = DEFS.map((t) => ({ ...t, eager_input_streaming: true }));

const Inputs = {
  get_overview: z.object({}),
  list_findings: z.object({ bucket: z.enum(["attention", "opportunity", "monitor", "all"]).optional() }),
  get_finding: z.object({ id: z.string() }),
  find_items: z.object({
    level: z.enum(LEVELS).optional(),
    name_contains: z.string().optional(),
    objective: z.enum(OBJECTIVES).optional(),
    sort: z.enum(["spend", "kpi_worse", "kpi_better", "best_performer", "worst_performer"]).optional(),
    limit: z.number().int().optional(),
  }),
  get_item: z.object({ level: z.enum(LEVELS), id: z.string() }),
  compare_items: z.object({ level: z.enum(LEVELS), id_a: z.string(), id_b: z.string() }),
  get_daily: z.object({ campaign_id: z.string().optional(), objective: z.enum(OBJECTIVES).optional() }),
  get_locations: z.object({ objective: z.enum(OBJECTIVES).optional() }),
};
export type ToolName = keyof typeof Inputs;

export function isToolName(n: string): n is ToolName {
  return n in Inputs;
}

// Validate and run one tool call. Returns JSON text for the tool_result.
export async function runTool(a: Analysis, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  if (!isToolName(name)) return { content: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true };
  const parsed = Inputs[name].safeParse(input ?? {});
  if (!parsed.success) return { content: JSON.stringify({ error: "Invalid input", details: parsed.error.issues.map((i) => i.message) }), isError: true };
  try {
    const out = await TOOLS[name](a, parsed.data as never);
    return { content: JSON.stringify(out), isError: false };
  } catch (err) {
    return { content: JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" }), isError: true };
  }
}

// ---------- formatting helpers ----------

const fk = (v: number | null, mode: KpiMode, cur: string) => (v === null ? null : mode === "roas" ? `${v.toFixed(2)}×` : money(v, cur));

const ITEM_METRICS: MetricKey[] = ["spend", "impressions", "reach", "frequency", "results", "cpm", "ctr", "cpc", "cvr", "resultRate", "roas", "aov"];

function rowsOf(a: Analysis, level: EntityLevel): CampaignRow[] {
  return level === "campaign" ? a.campaigns : a.byLevel[level];
}

function findRow(a: Analysis, level: EntityLevel, id: string): CampaignRow {
  const r = rowsOf(a, level).find((x) => x.info.id === id);
  if (!r) throw new Error(`No ${LEVEL_WORD[level].one} with id ${id} in this period. Use find_items to look up ids.`);
  return r;
}

function kpiBlock(r: CampaignRow, a: Analysis) {
  const cur = a.workspace.currency;
  return {
    name: kpiLabel(r.info.objective, r.mode),
    value: fk(r.kpiB, r.mode, cur) ?? "not available",
    previous: r.kpiA !== null ? fk(r.kpiA, r.mode, cur) : null,
    change: r.change !== null ? signedPct(r.change) : null,
    confidence: r.confidence,
  };
}

// The same assessment and next step as the Campaigns and Recommendations pages.
function planFor(a: Analysis, r: CampaignRow) {
  return computePlan(a, r.level).find((p) => p.row.info.id === r.info.id) ?? null;
}

function itemSummary(r: CampaignRow, a: Analysis): Json {
  const p = planFor(a, r);
  return {
    id: r.info.id,
    level: r.level,
    name: r.info.name,
    parent: r.info.parentName ?? null,
    platform: PLATFORM_LABEL[r.info.platform],
    objective: OBJECTIVE_DEFS[r.info.objective].label,
    status: r.info.status,
    spend: money(r.b.spend, a.workspace.currency),
    kpi: kpiBlock(r, a),
    assessment: p ? `${p.assessment} (${p.priority} priority)` : "no spend in this period",
    ...(r.isNew ? { new_this_period: true } : {}),
    ...(r.isStopped ? { stopped_this_period: true } : {}),
  };
}

function metricsOf(r: CampaignRow, a: Analysis): Json {
  const out: Json = {};
  const o = r.info.objective;
  for (const key of ITEM_METRICS) {
    const def = METRICS[key];
    const label = key === "results" ? OBJECTIVE_DEFS[o].resultLabel : def.short;
    if (!metricAvailable(key, o, r.availB)) {
      out[label] = "not in export";
      continue;
    }
    const vb = def.compute(r.b, o);
    if (vb === null) continue;
    const hasA = !!r.a && !!r.availA && metricAvailable(key, o, r.availA);
    const va = hasA ? def.compute(r.a!, o) : null;
    out[label] = {
      value: formatValue(vb, def.unit, a.workspace.currency),
      ...(va !== null ? { previous: formatValue(va, def.unit, a.workspace.currency), change: va ? signedPct(vb / va - 1) : null } : {}),
    };
  }
  return out;
}

function findingSummary(f: Finding, cur: string): Json {
  return {
    id: f.key,
    title: f.title,
    bucket: f.bucket,
    priority: f.priority,
    status: f.status,
    item: f.entityName,
    level: f.level,
    money_at_stake: `${money(f.moneyAtStake, cur)} (${pct(f.stakeShare, 0)} of spend)`,
    what_happened: f.whatHappened,
  };
}

// ---------- tools ----------

const TOOLS: { [K in ToolName]: (a: Analysis, input: z.infer<(typeof Inputs)[K]>) => Promise<Json> | Json } = {
  get_overview(a) {
    const cur = a.workspace.currency;
    const todo = a.findings.filter((f) => f.status === "todo");
    return {
      account: a.workspace.name,
      currency: cur,
      period: a.selection.label,
      compared_with: a.hasComparisonData ? a.selection.compareLabel : "nothing (no data for a comparison period)",
      spend: money(a.totals.spendB, cur),
      spend_change: a.totals.change !== null ? signedPct(a.totals.change) : null,
      objectives: a.objectives
        .filter((o) => o.b.spend > 0)
        .map((o) => ({
          objective: OBJECTIVE_DEFS[o.objective].label,
          share_of_spend: pct(o.spendShare, 0),
          results: o.kpiMissing ? "not in export" : num(resultCount(o.b, o.objective), true),
          kpi: {
            name: kpiLabel(o.objective, o.mode),
            value: o.kpiMissing ? "not in export" : fk(o.kpiB, o.mode, cur),
            previous: o.kpiA !== null ? fk(o.kpiA, o.mode, cur) : null,
            change: o.change !== null ? signedPct(o.change) : null,
            confidence: o.confidence,
          },
          target: o.goal ? fk(o.goal.value, o.mode, cur) : null,
          main_driver_of_change: o.decomposition
            ? o.decomposition.drivers
                .filter((d) => Number.isFinite(d.change))
                .sort((x, y) => y.weight - x.weight)
                .slice(0, 2)
                .map((d) => `${d.label} ${signedPct(d.change)} (${d.helped ? "helped" : "hurt"}, ${pct(d.weight, 0)} of the movement)`)
            : null,
        })),
      goal_status: a.goalStatus.map((g) => g.headline + (g.detail ? ` ${g.detail}` : "")),
      platforms: a.platforms.map((p) => `${PLATFORM_LABEL[p.platform]}: ${money(p.spendB, cur)} (${pct(p.share, 0)})`),
      campaigns_started: a.changes.started,
      campaigns_stopped: a.changes.stopped,
      data_notes: a.dataNotes.map((n) => n.text),
      findings: {
        needs_attention: todo.filter((f) => f.bucket === "attention").length,
        opportunities: todo.filter((f) => f.bucket === "opportunity").length,
        monitor: todo.filter((f) => f.bucket === "monitor").length,
        top: todo.slice(0, 3).map((f) => findingSummary(f, cur)),
      },
      done_and_rechecked: a.done.map((d) => `${d.title}: ${d.outcome.text}`),
    };
  },

  list_findings(a, { bucket }) {
    const list = a.findings.filter((f) => !bucket || bucket === "all" || f.bucket === bucket);
    return { findings: list.map((f) => findingSummary(f, a.workspace.currency)) };
  },

  get_finding(a, { id }) {
    const f = a.findings.find((x) => x.key === id);
    if (!f) throw new Error(`No finding with id ${id}. Use list_findings for ids.`);
    return {
      ...findingSummary(f, a.workspace.currency),
      campaign: f.campaignName,
      platform: f.platform ? PLATFORM_LABEL[f.platform] : null,
      why_it_matters: f.whyItMatters,
      likely_cause_hypothesis: f.likelyCause,
      evidence: f.evidence.map((e) => ({ metric: e.label, before: e.a, now: e.b })),
      extra_cost: f.extraCost?.text ?? null,
      also_in_this_campaign: f.related,
      recommended_action: f.action,
      risk: f.risk,
      recheck: `In ${f.recheckDays} days. ${f.recheckRule}`,
      why_this_priority: f.priorityReason,
      flagged_because: f.rule,
      confidence: f.confidence,
      based_on: f.dataBasis,
      item_id: f.entityId,
    };
  },

  find_items(a, { level = "campaign", name_contains, objective, sort = "spend", limit = 10 }) {
    let rows = rowsOf(a, level).filter((r) => r.b.spend > 0 || (r.aRaw?.spend ?? 0) > 0);
    if (name_contains) rows = rows.filter((r) => r.info.name.toLowerCase().includes(name_contains.toLowerCase()));
    if (objective) rows = rows.filter((r) => r.info.objective === objective);
    const pi = (r: CampaignRow) => r.piGoal ?? r.piPeer;
    const trend = (r: CampaignRow) => r.piTrend;
    const by: Record<string, (x: CampaignRow, y: CampaignRow) => number> = {
      spend: (x, y) => y.b.spend - x.b.spend,
      kpi_worse: (x, y) => (trend(x) ?? 9) - (trend(y) ?? 9),
      kpi_better: (x, y) => (trend(y) ?? -9) - (trend(x) ?? -9),
      best_performer: (x, y) => (pi(y) ?? -9) - (pi(x) ?? -9),
      worst_performer: (x, y) => (pi(x) ?? 9) - (pi(y) ?? 9),
    };
    if (sort !== "spend") rows = rows.filter((r) => (sort.startsWith("kpi") ? trend(r) : pi(r)) !== null);
    const list = [...rows].sort(by[sort]).slice(0, Math.min(25, Math.max(1, limit)));
    return {
      level: LEVEL_WORD[level].many,
      count: rows.length,
      items: list.map((r) => itemSummary(r, a)),
      note: rows.length === 0 && level !== "campaign" ? `No ${LEVEL_WORD[level].many} in the uploads for this period — the export may be at campaign level only.` : undefined,
    };
  },

  get_item(a, { level, id }) {
    const r = findRow(a, level, id);
    const cur = a.workspace.currency;
    const lenB = rangeDays(a.selection.b.from, a.selection.b.to);
    const kids = level === "campaign" ? (a.byLevel.ad.some((x) => x.info.campaignId === id) ? a.byLevel.ad : a.byLevel.ad_group).filter((x) => x.info.campaignId === id) : level === "ad_group" ? a.byLevel.ad.filter((x) => x.info.parentName === r.info.name && x.info.campaignId === r.info.campaignId) : [];
    return {
      ...itemSummary(r, a),
      metrics: metricsOf(r, a),
      next_step: planFor(a, r)?.action ?? null,
      why: planFor(a, r)?.why ?? null,
      compared_with: planFor(a, r)?.yardstick ?? null,
      target: r.goal ? `${fk(r.goal.value, r.mode, cur)} (${r.goal.source === "target" ? "your target" : "break-even"})` : null,
      similar_items: r.peerKpi !== null ? `${fk(r.peerKpi, r.mode, cur)} average across ${r.peerCount} similar ${LEVEL_WORD[level].many} on ${PLATFORM_LABEL[r.info.platform]}` : "fewer than 2 similar items to compare with",
      share_of_objective_spend: pct(r.spendShare, 0),
      still_learning: r.learning,
      based_on: dataBasis(a, r, lenB),
      findings: a.findings.filter((f) => f.entityId === id || (level === "campaign" && f.campaignId === id)).map((f) => ({ id: f.key, title: f.title, bucket: f.bucket })),
      biggest_parts: kids
        .filter((k) => k.b.spend > 0)
        .slice(0, 6)
        .map((k) => ({ id: k.info.id, level: k.level, name: k.info.name, spend: money(k.b.spend, cur), kpi: kpiBlock(k, a) })),
    };
  },

  compare_items(a, { level, id_a, id_b }) {
    const x = findRow(a, level, id_a);
    const y = findRow(a, level, id_b);
    const out: Json = { a: { ...itemSummary(x, a), metrics: metricsOf(x, a) }, b: { ...itemSummary(y, a), metrics: metricsOf(y, a) } };
    if (x.info.objective === y.info.objective && x.mode === y.mode && x.kpiB !== null && y.kpiB !== null) {
      const pi = performanceIndex(x.kpiB, y.kpiB, x.mode)!;
      const [w, l] = pi >= 1 ? [x, y] : [y, x];
      out.better = Math.abs(pi - 1) < 0.03 ? "about the same" : `${w.info.name} (${advantage(pi >= 1 ? pi : 1 / pi, x.mode)} ${kpiLabel(x.info.objective, x.mode)})`;
      out.main_reasons = Math.abs(pi - 1) < 0.03 ? [] : reasonsFor(x.info.objective, x.mode, w.b, l.b, a.workspace.currency).map((r) => r.text);
    } else {
      out.better = "They have different objectives, so their results can't be compared directly.";
    }
    return out;
  },

  async get_daily(a, { campaign_id, objective }) {
    if (!a.coverage.hasDaily) return { error: "The uploads have no daily breakdown, so there's no day-by-day data." };
    const cur = a.workspace.currency;
    let points: { date: string; m: ReturnType<typeof emptyMeasures> }[];
    let obj = objective ?? a.objectives[0]?.objective;
    let mode: KpiMode = a.objectives.find((o) => o.objective === obj)?.mode ?? "cost";
    if (campaign_id) {
      const r = findRow(a, "campaign", campaign_id);
      obj = r.info.objective;
      mode = r.mode;
      const from = a.daily[0]?.points[0]?.date ?? a.selection.b.from;
      const facts = (await loadFacts(a.workspace.id, from, a.selection.b.to)).filter((f) => f.campaignId === campaign_id && f.granularity === "daily");
      const byDay = new Map<string, ReturnType<typeof emptyMeasures>>();
      for (const f of facts) byDay.set(f.periodStart, sumMeasures([byDay.get(f.periodStart) ?? emptyMeasures(), f.measures]));
      points = [...byDay.entries()].sort(([p], [q]) => p.localeCompare(q)).map(([date, m]) => ({ date, m }));
    } else {
      points = (a.daily.find((d) => d.objective === obj)?.points ?? []).map((p) => ({ date: p.date, m: p.measures }));
    }
    if (!obj) return { error: "No data." };
    return {
      objective: OBJECTIVE_DEFS[obj].label,
      kpi: kpiLabel(obj, mode),
      days: points.map(({ date, m }) => {
        const results = resultCount(m, obj!);
        const kpi = mode === "roas" ? (m.spend > 0 ? m.conversionValue / m.spend : null) : mode === "cpm" ? (m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null) : results > 0 ? (m.spend / results) * (OBJECTIVE_DEFS[obj!].perThousand ? 1000 : 1) : null;
        return { date, spend: money(m.spend, cur), results: num(results), kpi: fk(kpi, mode, cur) ?? "no results" };
      }),
    };
  },
  // The same numbers as the Geography page.
  async get_locations(a, input) {
    const cur = a.workspace.currency;
    const ws = await getWorkspace(a.workspace.id);
    const g = await loadGeography(a, !!ws?.isSample, input.objective ? `obj:${input.objective}` : undefined);
    if (g.unavailable) return { available: false, note: "No location breakdown export was uploaded for these campaigns and dates, so AdMate can't say where the money went by location. It can be exported from the ads manager (by country, region or city) and uploaded under Upload report." };
    const d = g.goal.data;
    return {
      available: true,
      basis: g.basis,
      ...(g.simulated ? { simulated: "Sample account: this is a simulated split of the real totals, not real location data. Say so when you use it." } : {}),
      total_spend: money(g.total, cur),
      spend_by_location: g.places.map((p) => ({ location: p.name, spend: money(p.spend, cur), share_of_spend: pct(p.share) })),
      results_by_location:
        d && !d.unavailable
          ? {
              objective: d.objectiveLabel,
              result: d.resultLabel,
              average: `${d.kpiShort} ${fk(d.avg, d.mode, cur) ?? "no results"}`,
              rows: d.rows.map((r) => ({ location: r.name, spend: money(r.spend, cur), share_of_spend: pct(r.spendShare), results: num(r.results), share_of_results: pct(r.resultShare), [d.kpiShort]: fk(r.cost, d.mode, cur) ?? "no results", verdict: r.verdict })),
            }
          : null,
    };
  },
};
