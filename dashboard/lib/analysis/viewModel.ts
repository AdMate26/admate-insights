// The page-ready view of one analysis, shared by the app and the prototype: money at
// stake (looking backward only), what changed and why, one row per campaign / ad set /
// ad, and the detail behind every item. Moved here from docs/prototype/src/entry.ts so
// both show the same numbers.
import { computePlan, type Plan } from "./plan";
import { planDetail, findingDetail, type Detail } from "./detail";
import { alertDetails } from "./findingGroups";
import { templateSummary } from "./narrative";
import { managerSummaryFacts, managerSummaryText } from "./managerSummary";
import { decompose, type Decomposition } from "./decompose";
import { addDays, rangeDays } from "../dates";
import { rangeLabel } from "../format";
import { kpiLabel, kpiShort, kpiValue, OBJECTIVE_DEFS, resultCount, type Objective } from "../metrics/objectives";
import type { Analysis, CampaignRow, EntityLevel, Finding } from "./types";

// Money attached to an item, looking BACKWARD only (founder decision: no forecasts).
// Against what AdMate expected (its own past, the target, or similar items):
// extra cost / lost revenue for problems, money saved / extra revenue for wins.
export type Impact = { amount: number; label: "extra cost" | "lost revenue" | "saved" | "extra revenue" | "spend involved"; known: boolean };
export function planImpact(p: Plan): Impact | null {
  const r = p.row;
  const y = p.yardValue;
  const k = r.kpiB;
  if (y == null || k == null || y <= 0 || k <= 0) return null;
  if (r.mode === "roas") {
    const diff = (k - y) * r.b.spend;
    return diff >= 0 ? { amount: diff, label: "extra revenue", known: true } : { amount: -diff, label: "lost revenue", known: true };
  }
  const n = r.mode === "cpm" ? r.b.impressions / 1000 : resultCount(r.b, r.info.objective);
  if (n <= 0) return null;
  const diff = (k - y) * n;
  return diff >= 0 ? { amount: diff, label: "extra cost", known: true } : { amount: -diff, label: "saved", known: true };
}
export function findingImpact(f: Finding): Impact | null {
  if (!f.extraCost || !(f.extraCost.amount > 0)) return null;
  return { amount: f.extraCost.amount, label: /revenue/i.test(f.extraCost.text) ? "lost revenue" : "extra cost", known: true };
}

// Which of CPM, click rate and conversion rate moved the item's main result (log
// shares that add up exactly; see decompose.ts).
const drivers = (d: Decomposition | null) =>
  d ? d.drivers.map((x) => ({ key: x.key, label: x.label, a: x.a, b: x.b, change: x.change, weight: x.weight, helped: x.helped })) : null;
const driversOf = (r: CampaignRow) => (r.a && r.kpiA !== null && r.kpiB !== null ? drivers(decompose(r.info.objective, r.mode, r.a, r.b)) : null);

const POST_CLICK = (o: Objective) => OBJECTIVE_DEFS[o].postClick;

// minDate: the account's first day of data (for the "history checked" line).
export function viewModel(a: Analysis, minDate: string) {
  const plan = computePlan(a);
  const total = a.totals.spendB;
  const share = (spend: number) => (total > 0 ? spend / total : 0);
  type Ent = { level: EntityLevel; id: string } | null;
  const entityOfFinding = (f?: Finding): Ent => (f && f.entityId && f.level !== "account" ? { level: f.level, id: f.entityId } : null);
  const entityOfPlan = (p: Plan): Ent => ({ level: p.row.level, id: p.row.info.id });
  const item = (d: Detail, stake: number, bucket: string, entity: Ent, impact: Impact | null, detector: string) => ({
    ...d,
    stake,
    share: share(stake),
    bucket,
    entity,
    detector,
    impact: impact ?? { amount: stake, label: "spend involved" as const, known: false },
    // "Remind me later": the day it comes back (null when not snoozed).
    until: a.decisions[d.key]?.until ?? null,
  });

  const findingByKey = new Map(a.findings.map((f) => [f.key, f]));
  const planByKey = new Map<string, Plan>();
  const plansBy = { campaign: plan, ad_group: computePlan(a, "ad_group"), ad: computePlan(a, "ad") };
  for (const lv of ["campaign", "ad_group", "ad"] as const) for (const p of plansBy[lv]) planByKey.set(p.key, p);

  const problems = alertDetails(a, plan).map((d) => {
    const f = findingByKey.get(d.key);
    const p = planByKey.get(d.key);
    return item(d, f?.moneyAtStake ?? p?.row.b.spend ?? 0, "problem", p ? entityOfPlan(p) : entityOfFinding(f), f ? findingImpact(f) : p ? planImpact(p) : null, f?.detector ?? "plan");
  });
  const shown = new Set(problems.map((p) => p.key));
  const opportunities = [
    ...plan.filter((p) => p.kind === "opportunity").map((p) => item(planDetail(a, p), p.row.b.spend, "opportunity", entityOfPlan(p), planImpact(p), "plan")),
    ...a.findings.filter((f) => f.bucket === "opportunity").map((f) => item(findingDetail(a, f), f.moneyAtStake, "opportunity", entityOfFinding(f), findingImpact(f), f.detector)),
  ].filter((x) => !shown.has(x.key));
  const signals = [
    ...plan.filter((p) => p.kind === "signal").map((p) => item(planDetail(a, p), p.row.b.spend, "signal", entityOfPlan(p), planImpact(p), "plan")),
    ...a.findings.filter((f) => f.bucket === "monitor").map((f) => item(findingDetail(a, f), f.moneyAtStake, "signal", entityOfFinding(f), findingImpact(f), f.detector)),
  ];
  // Detected problems the user already decided on (done, dismissed or a reminder set):
  // the lists above leave them out, "Done & reminders" shows them.
  const closed = a.findings
    .filter((f) => f.status !== "todo" && f.status !== "in_review")
    .map((f) => item(findingDetail(a, f), f.moneyAtStake, f.bucket === "attention" ? "problem" : f.bucket === "opportunity" ? "opportunity" : "signal", entityOfFinding(f), findingImpact(f), f.detector));

  const great = [
    ...plan.filter((p) => p.kind === "opportunity" && p.stance === "scale").map((p) => ({ key: p.key, campaign: p.row.info.name, why: p.why, action: p.action, share: share(p.row.b.spend), spend: p.row.b.spend, platform: p.row.info.platform, kpi: `${kpiShort(p.row.info.objective, p.row.mode)} ${p.evidence[0]?.b ?? ""}`, priority: p.priority })),
    ...a.findings.filter((f) => f.bucket === "opportunity" && f.actionType === "SCALE_BUDGET").map((f) => ({ key: f.key, campaign: f.entityName, why: f.whatHappened, action: f.action, share: f.stakeShare, spend: f.moneyAtStake, platform: f.platform, kpi: `${f.evidence[0]?.label} ${f.evidence[0]?.b}`, priority: f.priority })),
  ].filter((g, i, arr) => arr.findIndex((x) => x.campaign === g.campaign) === i);
  const reuse = a.findings.filter((f) => f.bucket !== "monitor" && f.actionType === "REUSE_WINNER").slice(0, 3).map((f) => ({ key: f.key, name: f.entityName, where: findingDetail(a, f).where, why: f.whatHappened }));

  const campaignName = new Map(a.campaigns.map((c) => [c.info.id, c.info.name]));
  const adSetName = new Map(a.byLevel.ad_group.map((c) => [c.info.id, c.info.name]));
  const levelRows = (level: EntityLevel) => {
    const rows = level === "campaign" ? a.campaigns : a.byLevel[level];
    const plans = new Map(plansBy[level].map((p) => [p.row.info.id, p]));
    return rows
      .filter((r) => r.b.spend > 0)
      .map((r) => {
        const p = plans.get(r.info.id);
        const o = r.info.objective;
        const m = r.b;
        const clicks = m.linkClicks || m.clicksAll;
        const results = resultCount(m, o);
        const campaignId = level === "campaign" ? r.info.id : r.info.campaignId!;
        const adSetId = level === "ad" ? (r.info.parentId ?? null) : level === "ad_group" ? r.info.id : null;
        return {
          // An ad without a stored ad set id still knows its ad set's name (as plan.ts falls back to it).
          id: r.info.id, level, name: r.info.name, campaignId, campaignName: campaignName.get(campaignId) ?? null, adSetId, adSetName: adSetId ? adSetName.get(adSetId) ?? null : level === "ad" ? r.info.parentName ?? null : null,
          platform: r.info.platform, objective: o, objectiveLabel: OBJECTIVE_DEFS[o].label, role: r.role, status: r.info.status,
          spend: m.spend, share: share(m.spend), spendA: r.a?.spend ?? null, spendChange: r.a && r.a.spend > 0 ? m.spend / r.a.spend - 1 : null,
          impressions: m.impressions, reach: m.reach, frequency: m.reach > 0 ? m.impressions / m.reach : null,
          clicks, ctr: m.impressions > 0 ? clicks / m.impressions : null, cpc: clicks > 0 ? m.spend / clicks : null, cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null,
          results, cvr: POST_CLICK(o) && clicks > 0 ? results / clicks : null, revenue: m.conversionValue,
          kpiShort: kpiShort(o, r.mode), kpiLabel: kpiLabel(o, r.mode), mode: r.mode, kpi: r.kpiB, kpiA: r.kpiA, change: r.change, confidence: r.confidence,
          resultLabel: OBJECTIVE_DEFS[o].resultLabel, resultSingular: OBJECTIVE_DEFS[o].resultSingular,
          kind: p?.kind ?? null, label: p?.label ?? null, priority: p?.priority ?? null, stance: p?.stance ?? null, planKey: p?.key ?? null,
          expected: p?.yardValue ?? null, yardKind: p?.yardKind ?? null, yardstick: p?.yardstick ?? null, action: p?.action ?? null,
          impact: p ? planImpact(p) : null, drivers: driversOf(r), isNew: r.isNew,
        };
      });
  };
  const levels = { campaign: levelRows("campaign"), ad_group: levelRows("ad_group"), ad: levelRows("ad") };

  // "What changed": for each goal, the campaigns that moved it most, in money,
  // compared with their OWN previous period (extra cost or lost revenue at the old rate).
  const moversFor = (o: Objective) =>
    levels.campaign
      .filter((r) => r.objective === o && r.kpi != null && r.kpiA != null && r.kpiA > 0)
      .map((r) => {
        const amount = r.mode === "roas" ? (r.kpiA! - r.kpi!) * r.spend : (r.kpi! - r.kpiA!) * (r.mode === "cpm" ? r.impressions / 1000 : r.results);
        return { id: r.id, name: r.name, kpiA: r.kpiA, kpi: r.kpi, change: r.change, mode: r.mode, amount, worse: amount > 0, drivers: r.drivers };
      })
      .filter((x) => Math.abs(x.amount) >= 1)
      .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))
      .slice(0, 3);

  const objectives = a.objectives
    .filter((o) => o.b.spend > 0)
    .map((o) => ({
      objective: o.objective, label: OBJECTIVE_DEFS[o.objective].label, kpiLabel: kpiLabel(o.objective, o.mode), kpiShort: kpiShort(o.objective, o.mode), mode: o.mode,
      value: o.kpiB, previous: o.kpiA, change: o.change, confidence: o.confidence, spend: o.b.spend, share: o.spendShare, kpiMissing: o.kpiMissing,
      results: o.mode === "cpm" ? o.b.impressions : resultCount(o.b, o.objective),
      resultLabel: o.mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o.objective].resultLabel,
      resultSingular: o.mode === "cpm" ? "impression" : OBJECTIVE_DEFS[o.objective].resultSingular,
      daily: a.daily.find((d) => d.objective === o.objective)?.points.map((p) => ({ date: p.date, v: kpiValue(p.measures, o.objective, o.mode), spend: p.measures.spend, results: o.mode === "cpm" ? p.measures.impressions : resultCount(p.measures, o.objective) })) ?? [],
      drivers: drivers(o.decomposition),
      movers: moversFor(o.objective),
      // The goal as the engine judged it (lib/analysis/goalStatus.ts): the user's target,
      // the break-even and the verdict. CPM goals have no cost target here.
      target: o.mode !== "cpm" && o.goal?.source === "target" ? o.goal.value : null,
      breakEven: o.mode !== "cpm" ? o.breakEven : null,
      state: a.goalStatus.find((g) => g.objective === o.objective)?.state ?? "unknown",
    }));

  const details: Record<string, ReturnType<typeof item>> = {};
  for (const lv of ["campaign", "ad_group", "ad"] as const)
    for (const p of plansBy[lv]) details[p.key] = item(planDetail(a, p), p.row.b.spend, p.kind === "issue" ? "problem" : p.kind === "opportunity" ? "opportunity" : "other", entityOfPlan(p), planImpact(p), "plan");

  const summary = templateSummary(a);
  const lenB = rangeDays(a.selection.b.from, a.selection.b.to);
  const compared = !!a.selection.a && a.hasComparisonData;
  // Older history: from the first day of data to the day before the earlier of the two periods.
  const histEnd = addDays(compared && a.selection.a!.from < a.selection.b.from ? a.selection.a!.from : a.selection.b.from, -1);
  return {
    from: a.selection.b.from, to: a.selection.b.to, days: lenB,
    label: a.selection.label, compareLabel: compared ? a.selection.compareLabel : null,
    compareFrom: a.selection.a?.from ?? null, compareTo: a.selection.a?.to ?? null, perDay: a.selection.normalized && compared,
    history: minDate <= histEnd && a.selection.mode !== "reports" ? rangeLabel(minDate, histEnd) : null,
    spend: total, spendChange: a.totals.change, oneLine: summary[1] ?? summary[0] ?? "", summaryLines: summary,
    objectives, problems, opportunities, signals, closed, great, reuse,
    health: levels.campaign, levels, details,
    summaryReport: managerSummaryText(managerSummaryFacts(a)), summaryFacts: managerSummaryFacts(a), dataNotes: a.dataNotes,
  };
}
export type ViewModel = ReturnType<typeof viewModel>;
