import { addDays, rangeDays, weekday } from "../dates";
import { rangeLabel } from "../format";
import { emptyMeasures, sumMeasures, type Measures } from "../metrics/measures";
import { kpiLabel, kpiShort, kpiValue, OBJECTIVE_DEFS, resultCount, type KpiMode, type Objective } from "../metrics/objectives";
import type { Platform } from "../ingest/headers";
import { findingDetail, planDetail, type Detail } from "./detail";
import { alertDetails } from "./findingGroups";
import { templateSummary } from "./narrative";
import { computePlan, isOpen, type Plan } from "./plan";
import type { Role } from "./roles";
import type { Analysis, CampaignRow, EntityLevel, FactRow, FindingStatus, GoalStatus } from "./types";

// The v3 screens (Overview, Actions, Campaigns, the item drawer) all read this one
// view of the analysis, so every page shows the same items, priorities and money.

export type Bucket = "problem" | "opportunity" | "signal" | "other";
export interface Entity {
  level: EntityLevel;
  id: string;
}
export interface Item extends Detail {
  bucket: Bucket;
  stake: number; // spend of the affected item in the period
  share: number; // … as a share of all spend
  entity: Entity | null; // the campaign / ad set / ad it is about (for the daily chart)
  until: string | null; // "Remind me later" date
}

export interface DayPoint {
  date: string;
  spend: number;
  results: number;
  kpi: number | null;
}
export interface Series {
  mode: KpiMode;
  kpiShort: string;
  kpiLabel: string;
  resultLabel: string;
  days: DayPoint[];
}

export interface ObjectiveView {
  objective: Objective;
  label: string;
  kpiLabel: string;
  kpiShort: string;
  mode: KpiMode;
  value: number | null;
  previous: number | null;
  change: number | null;
  confidence: Detail["confidence"];
  spend: number;
  share: number;
  results: number;
  resultLabel: string;
  kpiMissing: boolean;
  goal: GoalStatus | null;
  target: number | null;
  breakEven: number | null;
  series: Series;
}

export interface LevelRow {
  id: string;
  level: EntityLevel;
  name: string;
  campaignId: string;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  platform: Platform;
  objective: Objective;
  objectiveLabel: string;
  objectiveSource: string;
  role: Role;
  roleSource: CampaignRow["roleSource"];
  spend: number;
  share: number;
  kpiShort: string;
  mode: KpiMode;
  kpi: number | null;
  kpiA: number | null;
  change: number | null;
  confidence: Detail["confidence"];
  results: number;
  resultLabel: string;
  ctr: number | null;
  cpm: number | null;
  kind: Plan["kind"] | null;
  label: string | null;
  priority: Plan["priority"] | null;
  planKey: string | null;
  expected: number | null;
  isNew: boolean;
}

const resultsOf = (m: Measures, o: Objective, mode: KpiMode) => (mode === "cpm" ? m.impressions : resultCount(m, o));
const resultLabelOf = (o: Objective, mode: KpiMode) => (mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o].resultLabel);

export function seriesOf(points: { date: string; measures: Measures }[], o: Objective, mode: KpiMode): Series {
  return {
    mode,
    kpiShort: kpiShort(o, mode),
    kpiLabel: kpiLabel(o, mode),
    resultLabel: resultLabelOf(o, mode),
    days: points.map((p) => ({ date: p.date, spend: p.measures.spend, results: resultsOf(p.measures, o, mode), kpi: kpiValue(p.measures, o, mode) })),
  };
}

// Day-by-day numbers for one campaign / ad set / ad: at least the 28 days up to the
// end of the period (or the whole period when longer). Days without delivery are 0.
export function entitySeries(facts: FactRow[], row: CampaignRow, from: string, to: string): Series {
  const start = from < addDays(to, -27) ? from : addDays(to, -27);
  const by = new Map<string, Measures>();
  for (const f of facts) {
    if (f.granularity !== "daily" || f.periodStart < start || f.periodEnd > to) continue;
    by.set(f.periodStart, sumMeasures([by.get(f.periodStart) ?? emptyMeasures(), f.measures]));
  }
  const points: { date: string; measures: Measures }[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) points.push({ date: d, measures: by.get(d) ?? emptyMeasures() });
  return seriesOf(points, row.info.objective, row.mode);
}

export function rowOf(a: Analysis, e: Entity): CampaignRow | undefined {
  const rows = e.level === "campaign" ? a.campaigns : a.byLevel[e.level];
  return rows.find((r) => r.info.id === e.id);
}

export function insightView(a: Analysis) {
  const plan = computePlan(a);
  const total = a.totals.spendB;
  const share = (spend: number) => (total > 0 ? spend / total : 0);
  const until = (key: string) => a.decisions[key]?.until ?? null;
  const entityOfFinding = (key: string): Entity | null => {
    const f = a.findings.find((x) => x.key === key);
    return f && f.entityId && f.level !== "account" ? { level: f.level, id: f.entityId } : null;
  };
  const entityOfPlan = (p: Plan): Entity => ({ level: p.row.level, id: p.row.info.id });
  const item = (d: Detail, stake: number, bucket: Bucket, entity: Entity | null): Item => ({ ...d, stake, share: share(stake), bucket, entity, until: until(d.key) });

  const objectives: ObjectiveView[] = a.objectives
    .filter((o) => o.b.spend > 0)
    .map((o) => {
      const def = OBJECTIVE_DEFS[o.objective];
      const g = a.goalStatus.find((x) => x.objective === o.objective) ?? null;
      const points = a.daily.find((d) => d.objective === o.objective)?.points ?? [];
      return {
        objective: o.objective,
        label: def.label,
        kpiLabel: kpiLabel(o.objective, o.mode),
        kpiShort: kpiShort(o.objective, o.mode),
        mode: o.mode,
        value: o.kpiB,
        previous: o.kpiA,
        change: o.change,
        confidence: o.confidence,
        spend: o.b.spend,
        share: o.spendShare,
        results: resultsOf(o.b, o.objective, o.mode),
        resultLabel: resultLabelOf(o.objective, o.mode),
        kpiMissing: o.kpiMissing,
        goal: g,
        target: o.goal?.source === "target" ? o.goal.value : null,
        breakEven: o.breakEven,
        series: seriesOf(points, o.objective, o.mode),
      };
    });

  // Problems: detected problems plus campaigns clearly worse than expected.
  const problems = alertDetails(a, plan).map((d) => {
    const f = a.findings.find((x) => x.key === d.key);
    const p = plan.find((x) => x.key === d.key);
    return item(d, f?.moneyAtStake ?? p?.row.b.spend ?? 0, "problem", p ? entityOfPlan(p) : entityOfFinding(d.key));
  });
  const shown = new Set(problems.map((p) => p.key));
  const opportunities = [
    ...plan.filter((p) => p.kind === "opportunity").map((p) => item(planDetail(a, p), p.row.b.spend, "opportunity", entityOfPlan(p))),
    ...a.findings.filter((f) => f.bucket === "opportunity").map((f) => item(findingDetail(a, f), f.moneyAtStake, "opportunity", entityOfFinding(f.key))),
  ].filter((x) => !shown.has(x.key));
  const signals = [
    ...plan.filter((p) => p.kind === "signal").map((p) => item(planDetail(a, p), p.row.b.spend, "signal", entityOfPlan(p))),
    ...a.findings.filter((f) => f.bucket === "monitor").map((f) => item(findingDetail(a, f), f.moneyAtStake, "signal", entityOfFinding(f.key))),
  ];

  const great = [
    ...plan
      .filter((p) => isOpen(p) && p.kind === "opportunity" && p.stance === "scale")
      .map((p) => ({ key: p.key, campaign: p.row.info.name, why: p.why, action: p.action, share: share(p.row.b.spend), spend: p.row.b.spend, platform: p.row.info.platform, kpi: `${kpiShort(p.row.info.objective, p.row.mode)} ${p.evidence[0]?.b ?? ""}`, priority: p.priority })),
    ...a.findings
      .filter((f) => f.status === "todo" && f.bucket === "opportunity" && f.actionType === "SCALE_BUDGET")
      .map((f) => ({ key: f.key, campaign: f.entityName ?? "", why: f.whatHappened, action: f.action, share: f.stakeShare, spend: f.moneyAtStake, platform: f.platform, kpi: `${f.evidence[0]?.label ?? ""} ${f.evidence[0]?.b ?? ""}`, priority: f.priority })),
  ].filter((g, i, arr) => arr.findIndex((x) => x.campaign === g.campaign) === i);

  const reuse = a.findings
    .filter((f) => f.status === "todo" && f.bucket !== "monitor" && f.actionType === "REUSE_WINNER")
    .slice(0, 3)
    .map((f) => ({ key: f.key, name: f.entityName ?? "", where: findingDetail(a, f).where, why: f.whatHappened }));

  const plansBy = { campaign: plan, ad_group: computePlan(a, "ad_group"), ad: computePlan(a, "ad") };
  const campaignName = new Map(a.campaigns.map((c) => [c.info.id, c.info.name]));
  const adSetName = new Map(a.byLevel.ad_group.map((c) => [c.info.id, c.info.name]));
  const levelRows = (level: EntityLevel): LevelRow[] => {
    const rows = level === "campaign" ? a.campaigns : a.byLevel[level];
    const plans = new Map(plansBy[level].map((p) => [p.row.info.id, p]));
    return rows
      .filter((r) => r.b.spend > 0)
      .map((r) => {
        const p = plans.get(r.info.id);
        const o = r.info.objective;
        const clicks = r.b.linkClicks || r.b.clicksAll;
        const campaignId = level === "campaign" ? r.info.id : (r.info.campaignId ?? "");
        const adSetId = level === "ad" ? (r.info.parentId ?? null) : level === "ad_group" ? r.info.id : null;
        return {
          id: r.info.id,
          level,
          name: r.info.name,
          campaignId,
          campaignName: campaignName.get(campaignId) ?? null,
          adSetId,
          adSetName: adSetId ? (adSetName.get(adSetId) ?? r.info.parentName ?? null) : null,
          platform: r.info.platform,
          objective: o,
          objectiveLabel: OBJECTIVE_DEFS[o].label,
          objectiveSource: r.info.objectiveSource,
          role: r.role,
          roleSource: r.roleSource,
          spend: r.b.spend,
          share: share(r.b.spend),
          kpiShort: kpiShort(o, r.mode),
          mode: r.mode,
          kpi: r.kpiB,
          kpiA: r.kpiA,
          change: r.change,
          confidence: r.confidence,
          results: resultsOf(r.b, o, r.mode),
          resultLabel: resultLabelOf(o, r.mode),
          ctr: r.b.impressions > 0 ? clicks / r.b.impressions : null,
          cpm: r.b.impressions > 0 ? (r.b.spend / r.b.impressions) * 1000 : null,
          kind: p?.kind ?? null,
          label: p?.label ?? null,
          priority: p?.priority ?? null,
          planKey: p?.key ?? null,
          expected: p?.yardValue ?? null,
          isNew: r.isNew,
        };
      });
  };

  // Every plan at every level, by key (the drawer opens any of them).
  const planByKey = new Map<string, Plan>();
  for (const lv of ["campaign", "ad_group", "ad"] as const) for (const p of plansBy[lv]) planByKey.set(p.key, p);
  const listed = [...problems, ...opportunities, ...signals];
  function find(key: string): Item | null {
    const hit = listed.find((d) => d.key === key);
    if (hit) return hit;
    const p = planByKey.get(key);
    if (p) return item(planDetail(a, p), p.row.b.spend, p.kind === "issue" ? "problem" : p.kind === "opportunity" ? "opportunity" : "other", entityOfPlan(p));
    const f = a.findings.find((x) => x.key === key);
    return f ? item(findingDetail(a, f), f.moneyAtStake, f.bucket === "attention" ? "problem" : f.bucket === "opportunity" ? "opportunity" : "signal", entityOfFinding(key)) : null;
  }
  // What opens when a campaign / ad set / ad row is clicked: a problem found on that
  // exact item is the richer view; otherwise its plan.
  function keyForEntity(e: Entity): string | null {
    const problem = [...problems, ...opportunities].find((p) => p.entity && p.entity.level === e.level && p.entity.id === e.id);
    return problem?.key ?? plansBy[e.level].find((p) => p.row.info.id === e.id)?.key ?? null;
  }

  const summary = templateSummary(a);
  const s = a.selection;
  const minDate = a.coverage.minDate;
  const compared = !!s.a && a.hasComparisonData;
  const histEnd = addDays(compared && s.a!.from < s.b.from ? s.a!.from : s.b.from, -1);
  return {
    from: s.b.from,
    to: s.b.to,
    days: rangeDays(s.b.from, s.b.to),
    label: s.label,
    compareLabel: compared ? s.compareLabel : null,
    perDay: s.normalized && compared,
    history: minDate && minDate <= histEnd && s.mode !== "reports" ? rangeLabel(minDate, histEnd) : null,
    spend: total,
    spendChange: a.totals.change,
    oneLine: summary[1] ?? summary[0] ?? "",
    objectives,
    problems,
    opportunities,
    signals,
    great,
    reuse,
    levels: { campaign: levelRows("campaign"), ad_group: levelRows("ad_group"), ad: levelRows("ad") },
    find,
    keyForEntity,
  };
}

export type InsightView = ReturnType<typeof insightView>;

// Waiting for a decision: open problems and opportunities that matter now.
export const decisions = (v: InsightView) => [...v.problems, ...v.opportunities].filter((d) => isOpenStatus(d.status) && (d.priority === "high" || d.priority === "medium"));
export const isOpenStatus = (s: FindingStatus) => s === "todo" || s === "in_review";

// Best day, cheapest day, best weekday (4 weeks) and the total, for the drawer and charts.
export function dailyFacts(series: Series, from: string, to: string) {
  const inP = series.days.filter((d) => d.date >= from && d.date <= to);
  if (inP.length === 0) return null;
  const best = inP.reduce((b, d) => (d.results > b.results ? d : b));
  const withRes = inP.filter((d) => d.kpi !== null && d.kpi > 0);
  const higher = series.mode === "roas";
  const cheapest = withRes.length ? withRes.reduce((b, d) => ((higher ? d.kpi! > b.kpi! : d.kpi! < b.kpi!) ? d : b)) : null;
  const byWd = Array.from({ length: 7 }, () => ({ r: 0, n: 0 }));
  for (const d of series.days) {
    byWd[weekday(d.date)].r += d.results;
    byWd[weekday(d.date)].n++;
  }
  const bestWd = byWd.map((x, i) => ({ i, avg: x.n ? x.r / x.n : 0 })).sort((p, q) => q.avg - p.avg)[0];
  return { best, cheapest, bestWeekday: bestWd, total: inP.reduce((s, d) => s + d.results, 0), days: inP.length };
}

// Sidebar badge: decisions waiting (open High / Medium problems and opportunities).
export function badgeCounts(a: Analysis): { actions: number } {
  return { actions: decisions(insightView(a)).length };
}
