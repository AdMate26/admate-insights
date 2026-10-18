// Browser build of AdMate's real v3 engine on the Lotus sample, for the prototype.
// Bundled with esbuild from the repo's lib/ (nothing here is copied logic except the
// clearly marked SIMULATED audience breakdowns, which the sample has no data for).
import { analyze } from "../../../lib/analysis/analyze";
import { computePlan } from "../../../lib/analysis/plan";
import { planDetail, findingDetail } from "../../../lib/analysis/detail";
import { alertDetails } from "../../../lib/analysis/findingGroups";
import { templateSummary } from "../../../lib/analysis/narrative";
import { managerSummaryFacts, managerSummaryText } from "../../../lib/analysis/managerSummary";
import { resolveSelection, type Coverage } from "../../../lib/analysis/periods";
import { addDays, rangeDays, weekday } from "../../../lib/dates";
import { rangeLabel } from "../../../lib/format";
import { emptyMeasures, sumMeasures, type Measures } from "../../../lib/metrics/measures";
import { kpiLabel, kpiShort, kpiValue, OBJECTIVE_DEFS, OBJECTIVES, resultCount, type KpiMode, type Objective } from "../../../lib/metrics/objectives";
import { generateClientRows, SAMPLE_ACCOUNT } from "../../../lib/sample/generate";
import type { AnalysisInput, CampaignInfo, FactRow } from "../../../lib/analysis/types";

export const END = "2026-10-16";
const client = SAMPLE_ACCOUNT;
const campaigns: CampaignInfo[] = [];
const lower: CampaignInfo[] = [];
const all: FactRow[] = [];
const adSetOf = new Map<string, string>(); // ad id -> ad set id
const byPlatform = generateClientRows(client, END);
for (const [platform, rows] of byPlatform) for (const r of rows) {
  let c = campaigns.find((x) => x.name === r.campaign);
  if (!c) { c = { id: `c${campaigns.length}`, name: r.campaign, platform, objective: r.objective, objectiveSource: "platform_objective", status: "active", secondaryStatus: null, budget: r.budget, firstSeen: addDays(END, -89), lastSeen: END }; campaigns.push(c); }
  let s = lower.find((x) => x.level === "ad_group" && x.name === r.adGroup && x.campaignId === c!.id);
  if (!s) { s = { ...c, id: `s${lower.length}`, name: r.adGroup!, level: "ad_group", campaignId: c.id, parentName: c.name, parentId: c.id }; lower.push(s); }
  let ad = lower.find((x) => x.level === "ad" && x.name === r.ad && x.campaignId === c!.id);
  if (!ad) { ad = { ...c, id: `a${lower.length}`, name: r.ad!, level: "ad", campaignId: c.id, parentName: s.name, parentId: s.id }; lower.push(ad); adSetOf.set(ad.id, s.id); }
  all.push({ campaignId: c.id, adGroupId: s.id, adId: ad.id, platform, granularity: "daily", periodStart: r.date!, periodEnd: r.date!, measures: r.measures });
}
export const MIN_DATE = addDays(END, -89);
const coverage: Coverage = { hasData: true, hasDaily: true, minDate: MIN_DATE, maxDate: END, dailyFrom: MIN_DATE, dailyTo: END, snapshots: [], reports: [] };
const campaignName = (id?: string) => campaigns.find((c) => c.id === id)?.name ?? null;
const lowerName = (id?: string) => lower.find((c) => c.id === id)?.name ?? null;

export function view(params: Record<string, string>) {
  const selection = resolveSelection(params, coverage)!;
  const w = (f: FactRow, a: string, b: string) => f.periodStart >= a && f.periodEnd <= b;
  const input: AnalysisInput = {
    workspace: { id: "w", name: client.name, currency: "USD" },
    goals: client.goals.map((g) => ({ objective: g.objective, target: g.target ?? null, marginPct: g.marginPct ?? null, leadToCustomerPct: g.leadToCustomerPct ?? null, profitPerCustomer: g.profitPerCustomer ?? null })),
    campaigns, entities: lower, coverage, selection,
    factsB: all.filter((f) => w(f, selection.b.from, selection.b.to)),
    factsA: selection.a ? all.filter((f) => w(f, selection.a!.from, selection.a!.to)) : [],
    recentDaily: all.filter((f) => w(f, addDays(selection.b.to, -27), selection.b.to)),
    factsHistory: all.filter((f) => f.periodEnd < selection.b.from),
    today: END, maturityDays: 0,
  };
  const a = analyze(input);
  const plan = computePlan(a);
  const total = a.totals.spendB;
  const withMoney = <T extends object>(d: T, spend: number, bucket: string) => ({ ...d, stake: spend, share: total > 0 ? spend / total : 0, bucket });
  const objectives = a.objectives.filter((o) => o.b.spend > 0).map((o) => ({
    objective: o.objective, label: OBJECTIVE_DEFS[o.objective].label, kpiLabel: kpiLabel(o.objective, o.mode), kpiShort: kpiShort(o.objective, o.mode), mode: o.mode,
    value: o.kpiB, previous: o.kpiA, change: o.change, confidence: o.confidence, spend: o.b.spend, share: o.spendShare,
    results: o.mode === "cpm" ? o.b.impressions : resultCount(o.b, o.objective), resultLabel: o.mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o.objective].resultLabel,
    daily: a.daily.find((d) => d.objective === o.objective)?.points.map((p) => ({ date: p.date, v: kpiValue(p.measures, o.objective, o.mode), spend: p.measures.spend, results: o.mode === "cpm" ? p.measures.impressions : resultCount(p.measures, o.objective) })) ?? [],
  }));
  const problems = alertDetails(a, plan).map((d) => {
    const f = a.findings.find((x) => x.key === d.key);
    const p = plan.find((x) => x.key === d.key);
    return withMoney(d, f?.moneyAtStake ?? p?.row.b.spend ?? 0, "problem");
  });
  const shown = new Set(problems.map((p) => p.key));
  const opportunities = [
    ...plan.filter((p) => p.kind === "opportunity").map((p) => withMoney(planDetail(a, p), p.row.b.spend, "opportunity")),
    ...a.findings.filter((f) => f.bucket === "opportunity").map((f) => withMoney(findingDetail(a, f), f.moneyAtStake, "opportunity")),
  ].filter((x) => !shown.has(x.key));
  const signals = [
    ...plan.filter((p) => p.kind === "signal").map((p) => withMoney(planDetail(a, p), p.row.b.spend, "signal")),
    ...a.findings.filter((f) => f.bucket === "monitor").map((f) => withMoney(findingDetail(a, f), f.moneyAtStake, "signal")),
  ];
  const great = [
    ...plan.filter((p) => p.kind === "opportunity" && p.stance === "scale").map((p) => ({ key: p.key, campaign: p.row.info.name, why: p.why, action: p.action, share: total > 0 ? p.row.b.spend / total : 0, spend: p.row.b.spend, platform: p.row.info.platform, kpi: `${kpiShort(p.row.info.objective, p.row.mode)} ${p.evidence[0]?.b ?? ""}` })),
    ...a.findings.filter((f) => f.bucket === "opportunity" && f.actionType === "SCALE_BUDGET").map((f) => ({ key: f.key, campaign: f.entityName, why: f.whatHappened, action: f.action, share: f.stakeShare, spend: f.moneyAtStake, platform: f.platform, kpi: `${f.evidence[0]?.label} ${f.evidence[0]?.b}` })),
  ].filter((g, i, arr) => arr.findIndex((x) => x.campaign === g.campaign) === i);
  const reuse = a.findings.filter((f) => f.bucket !== "monitor" && f.actionType === "REUSE_WINNER").slice(0, 3).map((f) => ({ key: f.key, name: f.entityName, where: findingDetail(a, f).where, why: f.whatHappened }));
  const plansBy = { campaign: plan, ad_group: computePlan(a, "ad_group"), ad: computePlan(a, "ad") };
  const levelRows = (level: "campaign" | "ad_group" | "ad") => {
    const rows = level === "campaign" ? a.campaigns : a.byLevel[level];
    const plans = new Map(plansBy[level].map((p) => [p.row.info.id, p]));
    return rows.filter((r) => r.b.spend > 0).map((r) => {
      const p = plans.get(r.info.id);
      const o = r.info.objective;
      const clicks = r.b.linkClicks || r.b.clicksAll;
      const campaignId = level === "campaign" ? r.info.id : r.info.campaignId!;
      const adSetId = level === "ad" ? adSetOf.get(r.info.id)! : level === "ad_group" ? r.info.id : null;
      return {
        id: r.info.id, level, name: r.info.name, campaignId, campaignName: campaignName(campaignId), adSetId, adSetName: adSetId ? lowerName(adSetId) : null,
        platform: r.info.platform, objective: o, objectiveLabel: OBJECTIVE_DEFS[o].label, role: r.role,
        spend: r.b.spend, share: total > 0 ? r.b.spend / total : 0,
        kpiShort: kpiShort(o, r.mode), mode: r.mode, kpi: r.kpiB, kpiA: r.kpiA, change: r.change, confidence: r.confidence,
        results: resultCount(r.b, o), resultLabel: OBJECTIVE_DEFS[o].resultLabel,
        ctr: r.b.impressions > 0 ? clicks / r.b.impressions : null, cpm: r.b.impressions > 0 ? (r.b.spend / r.b.impressions) * 1000 : null,
        kind: p?.kind ?? null, label: p?.label ?? null, priority: p?.priority ?? null, planKey: p?.key ?? null, value: r.kpiB, expected: p?.yardValue ?? null,
      };
    });
  };
  const details = Object.fromEntries((["campaign", "ad_group", "ad"] as const).flatMap((lv) => plansBy[lv].map((p) => [p.key, { ...withMoney(planDetail(a, p), p.row.b.spend, p.kind === "issue" ? "problem" : p.kind === "opportunity" ? "opportunity" : "other"), entity: { level: lv, id: p.row.info.id } }])));
  // Problems/opportunities found by detectors also point at their entity (for the daily chart).
  const entityOf = (key: string) => {
    const f = a.findings.find((x) => x.key === key);
    return f && f.entityId && f.level !== "account" ? { level: f.level, id: f.entityId } : null;
  };
  for (const list of [problems, opportunities, signals]) for (const d of list as { key: string; entity?: unknown }[]) d.entity = d.entity ?? entityOf(d.key) ?? (details[d.key] as { entity?: unknown } | undefined)?.entity ?? null;
  const summary = templateSummary(a);
  const lenB = rangeDays(a.selection.b.from, a.selection.b.to);
  return {
    from: a.selection.b.from, to: a.selection.b.to, days: lenB,
    label: a.selection.label, compareLabel: a.selection.a && a.hasComparisonData ? a.selection.compareLabel : null,
    compareFrom: a.selection.a?.from ?? null, compareTo: a.selection.a?.to ?? null, perDay: a.selection.normalized && a.hasComparisonData,
    history: a.selection.b.from > MIN_DATE ? rangeLabel(MIN_DATE, addDays(a.selection.a && a.hasComparisonData && a.selection.a.from < a.selection.b.from ? a.selection.a.from : a.selection.b.from, -1)) : null,
    spend: total, spendChange: a.totals.change, oneLine: summary[1] ?? summary[0], summaryLines: summary,
    objectives, problems, opportunities, signals, great, reuse,
    health: levelRows("campaign"),
    levels: { campaign: levelRows("campaign"), ad_group: levelRows("ad_group"), ad: levelRows("ad") },
    details, summaryReport: managerSummaryText(managerSummaryFacts(a)), summaryFacts: managerSummaryFacts(a), dataNotes: a.dataNotes,
  };
}

// Day-by-day numbers for one campaign / ad set / ad, ending on `to` (at least 28 days).
export function daily(level: "campaign" | "ad_group" | "ad", id: string, from: string, to: string) {
  const start = from < addDays(to, -27) ? from : addDays(to, -27);
  const key = (f: FactRow) => (level === "campaign" ? f.campaignId : level === "ad_group" ? f.adGroupId : f.adId);
  const info = (level === "campaign" ? campaigns : lower).find((c) => c.id === id)!;
  const o = info.objective;
  const mode: KpiMode = o === "sales" ? "roas" : o === "awareness" ? "cpm" : "cost";
  const days: { date: string; weekday: number; spend: number; results: number; kpi: number | null }[] = [];
  const by = new Map<string, Measures>();
  for (const f of all) if (key(f) === id && f.periodStart >= start && f.periodEnd <= to) by.set(f.periodStart, sumMeasures([by.get(f.periodStart) ?? emptyMeasures(), f.measures]));
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const m = by.get(d) ?? emptyMeasures();
    days.push({ date: d, weekday: weekday(d), spend: m.spend, results: mode === "cpm" ? m.impressions : resultCount(m, o), kpi: kpiValue(m, o, mode) });
  }
  return { mode, kpiShort: kpiShort(o, mode), kpiLabel: kpiLabel(o, mode), resultLabel: mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o].resultLabel, days };
}

// ---------------------------------------------------------------------------
// Audience Insight. The sample has no breakdown exports, so the SPLITS below are
// SIMULATED (deterministic profiles per campaign, adding up exactly to each
// campaign's real spend and results). The insight rules are the proposal for the
// real feature, which would read uploaded breakdown exports instead.
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
// [segment, share of spend (weight), efficiency (results per $, relative)]
const PROFILES: Record<string, [string, number, number][]> = {
  age_gender: [
    ["Women 18–24", 16, 0.95], ["Women 25–34", 26, 1.35], ["Women 35–44", 17, 1.1], ["Women 45–54", 8, 0.8], ["Women 55+", 4, 0.55],
    ["Men 18–24", 9, 0.6], ["Men 25–34", 9, 0.7], ["Men 35–44", 6, 0.6], ["Men 45+", 5, 0.35],
  ],
  location: [["Phnom Penh", 44, 1.15], ["Siem Reap", 12, 1.05], ["Battambang", 9, 0.7], ["Kandal", 8, 1.0], ["Kampong Cham", 7, 0.85], ["Preah Sihanouk", 6, 0.6], ["Takeo", 5, 0.9], ["Other provinces", 9, 0.75]],
  placement: [["Facebook Feed", 30, 1.0], ["Instagram Feed", 18, 1.15], ["Instagram Reels", 16, 1.25], ["Facebook Reels", 10, 0.95], ["Stories", 12, 0.9], ["Messenger", 4, 0.8], ["Audience Network", 10, 0.3]],
  placement_tiktok: [["TikTok For You feed", 82, 1.05], ["Pangle (partner apps)", 18, 0.45]],
  device: [["Mobile app", 86, 1.03], ["Mobile web", 9, 0.85], ["Desktop", 5, 0.7]],
  hour: Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2, "0")}:00`, [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3, 3.5, 3.6, 4, 4.8, 4.2, 3.6, 3.5, 3.8, 4.4, 5.4, 6.6, 7.2, 6.4, 4.4, 2.2][h], [0.7, 0.6, 0.5, 0.5, 0.5, 0.6, 0.8, 0.9, 0.95, 1, 1, 1, 1.05, 1, 0.95, 0.95, 1, 1.05, 1.15, 1.25, 1.3, 1.2, 1, 0.8][h]] as [string, number, number]),
};
export const BREAKDOWNS = { age_gender: "Age & gender", location: "Location", placement: "Placement", device: "Device", weekday: "Day of week", hour: "Time of day" } as const;
type Seg = { name: string; spend: number; results: number };

function split(profile: [string, number, number][], spend: number, results: number, seed: number): Seg[] {
  const r = rng(seed);
  const rows = profile.map(([name, w, e]) => ({ name, w: w * (0.85 + r() * 0.3), e: e * (0.9 + r() * 0.2) }));
  const sw = rows.reduce((s, x) => s + x.w, 0), se = rows.reduce((s, x) => s + x.w * x.e, 0);
  const exact = rows.map((x) => (results * x.w * x.e) / se);
  const floor = exact.map(Math.floor);
  let left = Math.round(results) - floor.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((p, q) => q[0] - p[0]);
  for (const [, i] of order) { if (left <= 0) break; floor[i]++; left--; }
  return rows.map((x, i) => ({ name: x.name, spend: (spend * x.w) / sw, results: floor[i] }));
}

export function audienceTargets(params: Record<string, string>) {
  const selection = resolveSelection(params, coverage)!;
  const spendBy = new Map<Objective, number>();
  for (const f of all) if (f.periodStart >= selection.b.from && f.periodEnd <= selection.b.to) {
    const o = campaigns.find((c) => c.id === f.campaignId)!.objective;
    spendBy.set(o, (spendBy.get(o) ?? 0) + f.measures.spend);
  }
  return {
    objectives: OBJECTIVES.filter((o) => (spendBy.get(o) ?? 0) > 0).sort((x, y) => spendBy.get(y)! - spendBy.get(x)!).map((o) => ({ objective: o, label: OBJECTIVE_DEFS[o].label })),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, objective: c.objective, platform: c.platform })),
  };
}

// target: "obj:<objective>" (all campaigns with that objective) or "c:<campaign id>".
export function audience(params: Record<string, string>, target: string, breakdown: keyof typeof BREAKDOWNS) {
  const selection = resolveSelection(params, coverage)!;
  const chosen = target.startsWith("c:") ? campaigns.filter((c) => c.id === target.slice(2)) : campaigns.filter((c) => c.objective === target.slice(4));
  const o = chosen[0].objective;
  const mode: KpiMode = o === "awareness" ? "cpm" : "cost";
  const resultsOf = (m: Measures) => (mode === "cpm" ? m.impressions : resultCount(m, o));
  // Day of week uses the REAL daily data: the 4 weeks ending on the period's last day (or the whole period if longer).
  const start = selection.b.from < addDays(selection.b.to, -27) ? selection.b.from : addDays(selection.b.to, -27);
  let segs: Seg[] = [];
  let basis: string;
  if (breakdown === "weekday") {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const acc = names.map((name) => ({ name, spend: 0, results: 0 }));
    for (const f of all) if (chosen.some((c) => c.id === f.campaignId) && f.periodStart >= start && f.periodEnd <= selection.b.to) {
      const d = acc[weekday(f.periodStart)];
      d.spend += f.measures.spend; d.results += resultsOf(f.measures);
    }
    segs = [...acc.slice(1), acc[0]];
    basis = `Real daily numbers, ${rangeLabel(start, selection.b.to)}`;
  } else {
    for (const c of chosen) {
      const m = sumMeasures(all.filter((f) => f.campaignId === c.id && f.periodStart >= selection.b.from && f.periodEnd <= selection.b.to).map((f) => f.measures));
      if (m.spend <= 0) continue;
      const profile = breakdown === "placement" && c.platform === "tiktok" ? PROFILES.placement_tiktok : PROFILES[breakdown];
      for (const s of split(profile, m.spend, resultsOf(m), hash(`${c.name}|${breakdown}`))) {
        const e = segs.find((x) => x.name === s.name);
        if (e) { e.spend += s.spend; e.results += s.results; } else segs.push({ ...s });
      }
    }
    basis = `Simulated split of the real totals, ${rangeLabel(selection.b.from, selection.b.to)}`;
  }
  const spend = segs.reduce((s, x) => s + x.spend, 0), results = segs.reduce((s, x) => s + x.results, 0);
  const avg = results > 0 ? (mode === "cpm" ? (spend / results) * 1000 : spend / results) : null;
  const rows = segs.map((x) => {
    const spendShare = spend > 0 ? x.spend / spend : 0, resultShare = results > 0 ? x.results / results : 0;
    const expected = results * spendShare;
    const z = expected > 0 ? (x.results - expected) / Math.sqrt(expected) : 0;
    const index = spendShare > 0 ? resultShare / spendShare : null; // >1 = more results than its share of spend
    const cost = x.results > 0 ? (mode === "cpm" ? (x.spend / x.results) * 1000 : x.spend / x.results) : null;
    // Insight rules (proposal): clear and real, never on a sliver of the budget.
    const verdict =
      breakdown !== "hour" && x.results < 10 && spendShare < 0.05 ? "small"
      : index !== null && index >= 1.25 && z >= 1.96 ? "best"
      : index !== null && index <= 0.75 && spendShare >= 0.05 && z <= -1.96 ? "costly"
      : "average";
    return { name: x.name, spend: x.spend, results: x.results, spendShare, resultShare, cost, index, z, verdict };
  });
  return { objective: o, objectiveLabel: OBJECTIVE_DEFS[o].label, mode, resultLabel: mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o].resultLabel, kpiShort: kpiShort(o, mode), spend, results, avg, rows, basis, simulated: breakdown !== "weekday", campaigns: chosen.map((c) => c.name) };
}

export const meta = {
  account: client.name, minDate: MIN_DATE, end: END,
  reports: [...byPlatform].map(([platform, rows]) => ({ fileName: `sample-${platform}-ads-daily.csv`, platform, from: MIN_DATE, to: END, rows: rows.length })),
  targets: [...new Set(campaigns.map((c) => c.objective))].map((o) => {
    const g = client.goals.find((x) => x.objective === o);
    const mode = o === "sales" ? "roas" : o === "awareness" ? "cpm" : "cost";
    return { objective: o, label: OBJECTIVE_DEFS[o].label, kpiLabel: kpiLabel(o, mode), kpiShort: kpiShort(o, mode), mode, target: g?.target ?? null, marginPct: g?.marginPct ?? null, closePct: g?.leadToCustomerPct ?? null, profit: g?.profitPerCustomer ?? null };
  }),
  allObjectives: OBJECTIVES.map((o) => ({ objective: o, label: OBJECTIVE_DEFS[o].label })),
};
