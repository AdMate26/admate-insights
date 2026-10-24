// Browser build of AdMate's real engine for the prototype, bundled with esbuild from
// the repo's lib/. It analyses the four SAMPLE accounts that ship with the product
// (Lotus Skincare plus the three sample businesses in lib/sample/generate.ts) live, for
// any period the page asks for. Nothing here is copied logic, except the clearly
// marked SIMULATED audience breakdowns for the Lotus sample (it has no breakdown exports).
import { analyze } from "../../../lib/analysis/analyze";
import { viewModel } from "../../../lib/analysis/viewModel";
import { resolveSelection, type Coverage } from "../../../lib/analysis/periods";
import { addDays, weekday } from "../../../lib/dates";
import { rangeLabel } from "../../../lib/format";
import { emptyMeasures, sumMeasures, type Measures } from "../../../lib/metrics/measures";
import { kpiLabel, kpiShort, kpiValue, OBJECTIVE_DEFS, OBJECTIVES, resultCount, type KpiMode, type Objective } from "../../../lib/metrics/objectives";
import { generateClientRows, SAMPLE_ACCOUNT, SAMPLE_CLIENTS, type SampleClient } from "../../../lib/sample/generate";
import type { Analysis, AnalysisInput, CampaignInfo, FactRow } from "../../../lib/analysis/types";
import type { Platform } from "../../../lib/ingest/headers";

export const END = "2026-10-16";
const ACCOUNTS: { id: string; client: SampleClient }[] = [
  { id: "lotus", client: SAMPLE_ACCOUNT },
  { id: "acme", client: SAMPLE_CLIENTS[0] },
  { id: "bloom", client: SAMPLE_CLIENTS[1] },
  { id: "northwind", client: SAMPLE_CLIENTS[2] },
];

interface Account {
  id: string;
  client: SampleClient;
  campaigns: CampaignInfo[];
  lower: CampaignInfo[];
  all: FactRow[];
  coverage: Coverage;
  min: string;
  rowsByPlatform: [Platform, number][];
}
const built = new Map<string, Account>();

// One sample account's 90 days of daily ad-level rows (built once, on first use).
function account(id?: string): Account {
  const def = ACCOUNTS.find((x) => x.id === id) ?? ACCOUNTS[0];
  const hit = built.get(def.id);
  if (hit) return hit;
  const campaigns: CampaignInfo[] = [];
  const lower: CampaignInfo[] = [];
  const all: FactRow[] = [];
  const pid = (s: string) => `${def.id}-${s}`; // ids are unique across accounts
  const byPlatform = generateClientRows(def.client, END);
  for (const [platform, rows] of byPlatform)
    for (const r of rows) {
      let c = campaigns.find((x) => x.name === r.campaign);
      if (!c) {
        c = { id: pid(`c${campaigns.length}`), name: r.campaign, platform, objective: r.objective, objectiveSource: "platform_objective", status: "active", secondaryStatus: null, budget: r.budget, firstSeen: addDays(END, -89), lastSeen: END };
        campaigns.push(c);
      }
      const camp = c;
      let s = lower.find((x) => x.level === "ad_group" && x.name === r.adGroup && x.campaignId === camp.id);
      if (!s) {
        s = { ...camp, id: pid(`s${lower.length}`), name: r.adGroup!, level: "ad_group", campaignId: camp.id, parentName: camp.name, parentId: camp.id };
        lower.push(s);
      }
      const set = s;
      let ad = lower.find((x) => x.level === "ad" && x.name === r.ad && x.campaignId === camp.id);
      if (!ad) {
        ad = { ...camp, id: pid(`a${lower.length}`), name: r.ad!, level: "ad", campaignId: camp.id, parentName: set.name, parentId: set.id };
        lower.push(ad);
      }
      all.push({ campaignId: camp.id, adGroupId: set.id, adId: ad.id, platform, granularity: "daily", periodStart: r.date!, periodEnd: r.date!, measures: r.measures });
    }
  const min = addDays(END, -89);
  const acc: Account = {
    id: def.id,
    client: def.client,
    campaigns,
    lower,
    all,
    min,
    coverage: { hasData: true, hasDaily: true, minDate: min, maxDate: END, dailyFrom: min, dailyTo: END, snapshots: [], reports: [] },
    rowsByPlatform: [...byPlatform].map(([p, rows]) => [p, rows.length]),
  };
  built.set(def.id, acc);
  return acc;
}

export function accounts() {
  return ACCOUNTS.map(({ id, client }) => ({ id, name: client.name, industry: client.industry, country: client.country ?? null, currency: client.currency }));
}

function analysisFor(A: Account, params: Record<string, string>): Analysis {
  const selection = resolveSelection(params, A.coverage)!;
  const w = (f: FactRow, from: string, to: string) => f.periodStart >= from && f.periodEnd <= to;
  const input: AnalysisInput = {
    workspace: { id: A.id, name: A.client.name, currency: A.client.currency },
    goals: A.client.goals.map((g) => ({ objective: g.objective, target: g.target ?? null, marginPct: g.marginPct ?? null, leadToCustomerPct: g.leadToCustomerPct ?? null, profitPerCustomer: g.profitPerCustomer ?? null })),
    campaigns: A.campaigns,
    entities: A.lower,
    coverage: A.coverage,
    selection,
    factsB: A.all.filter((f) => w(f, selection.b.from, selection.b.to)),
    factsA: selection.a ? A.all.filter((f) => w(f, selection.a!.from, selection.a!.to)) : [],
    recentDaily: A.all.filter((f) => w(f, addDays(selection.b.to, -27), selection.b.to)),
    factsHistory: A.all.filter((f) => f.periodEnd < selection.b.from),
    today: END,
    maturityDays: 0,
  };
  return analyze(input);
}

// The page-ready view (money at stake, what changed and why, rows, details) is the
// app's own lib/analysis/viewModel.ts, so the prototype and the app show the same numbers.
export function view(params: Record<string, string>, acctId?: string) {
  const A = account(acctId);
  return { account: A.id, ...viewModel(analysisFor(A, params), A.min) };
}

// Day-by-day numbers for one campaign / ad set / ad, ending on `to` (at least 28 days).
export function daily(level: "campaign" | "ad_group" | "ad", id: string, from: string, to: string, acctId?: string) {
  const A = account(acctId);
  const start = from < addDays(to, -27) ? from : addDays(to, -27);
  const key = (f: FactRow) => (level === "campaign" ? f.campaignId : level === "ad_group" ? f.adGroupId : f.adId);
  const info = (level === "campaign" ? A.campaigns : A.lower).find((c) => c.id === id);
  if (!info) return null;
  const o = info.objective;
  const mode: KpiMode = o === "sales" ? "roas" : o === "awareness" ? "cpm" : "cost";
  const days: { date: string; weekday: number; spend: number; results: number; kpi: number | null }[] = [];
  const by = new Map<string, Measures>();
  for (const f of A.all) if (key(f) === id && f.periodStart >= start && f.periodEnd <= to) by.set(f.periodStart, sumMeasures([by.get(f.periodStart) ?? emptyMeasures(), f.measures]));
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const m = by.get(d) ?? emptyMeasures();
    days.push({ date: d, weekday: weekday(d), spend: m.spend, results: mode === "cpm" ? m.impressions : resultCount(m, o), kpi: kpiValue(m, o, mode) });
  }
  return { mode, kpiShort: kpiShort(o, mode), kpiLabel: kpiLabel(o, mode), resultLabel: mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o].resultLabel, days };
}

// ---------------------------------------------------------------------------
// Audience Insight. Only the Lotus sample shows age & gender, location, placement,
// device and hour, and those splits are SIMULATED (deterministic profiles per
// campaign that add up exactly to each campaign's real spend and results). The
// other sample accounts show the honest "no breakdown export yet" state. Day of
// week uses the real daily data for every account.
// ---------------------------------------------------------------------------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

export function audienceTargets(params: Record<string, string>, acctId?: string) {
  const A = account(acctId);
  const selection = resolveSelection(params, A.coverage)!;
  const spendBy = new Map<Objective, number>();
  for (const f of A.all) if (f.periodStart >= selection.b.from && f.periodEnd <= selection.b.to) {
    const o = A.campaigns.find((c) => c.id === f.campaignId)!.objective;
    spendBy.set(o, (spendBy.get(o) ?? 0) + f.measures.spend);
  }
  return {
    objectives: OBJECTIVES.filter((o) => (spendBy.get(o) ?? 0) > 0).sort((x, y) => spendBy.get(y)! - spendBy.get(x)!).map((o) => ({ objective: o, label: OBJECTIVE_DEFS[o].label })),
    campaigns: A.campaigns.map((c) => ({ id: c.id, name: c.name, objective: c.objective, platform: c.platform })),
  };
}

// target: "obj:<objective>" (all campaigns with that objective) or "c:<campaign id>".
export function audience(params: Record<string, string>, target: string, breakdown: keyof typeof BREAKDOWNS, acctId?: string) {
  const A = account(acctId);
  const selection = resolveSelection(params, A.coverage)!;
  const chosen = target.startsWith("c:") ? A.campaigns.filter((c) => c.id === target.slice(2)) : A.campaigns.filter((c) => c.objective === target.slice(4));
  if (!chosen.length) return null;
  const o = chosen[0].objective;
  const mode: KpiMode = o === "awareness" ? "cpm" : "cost";
  const resultsOf = (m: Measures) => (mode === "cpm" ? m.impressions : resultCount(m, o));
  const base = { objective: o, objectiveLabel: OBJECTIVE_DEFS[o].label, mode, resultLabel: mode === "cpm" ? "impressions" : OBJECTIVE_DEFS[o].resultLabel, kpiShort: kpiShort(o, mode), campaigns: chosen.map((c) => c.name) };
  // Breakdown exports: only the Lotus sample has (simulated) ones.
  if (breakdown !== "weekday" && A.id !== "lotus") return { ...base, spend: 0, results: 0, avg: null, rows: [], basis: "", simulated: false, unavailable: true };
  // Day of week uses the REAL daily data: the 4 weeks ending on the period's last day (or the whole period if longer).
  const start = selection.b.from < addDays(selection.b.to, -27) ? selection.b.from : addDays(selection.b.to, -27);
  let segs: Seg[] = [];
  let basis: string;
  if (breakdown === "weekday") {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const acc = names.map((name) => ({ name, spend: 0, results: 0 }));
    for (const f of A.all) if (chosen.some((c) => c.id === f.campaignId) && f.periodStart >= start && f.periodEnd <= selection.b.to) {
      const d = acc[weekday(f.periodStart)];
      d.spend += f.measures.spend; d.results += resultsOf(f.measures);
    }
    segs = [...acc.slice(1), acc[0]];
    basis = `Real daily numbers, ${rangeLabel(start, selection.b.to)}`;
  } else {
    for (const c of chosen) {
      const m = sumMeasures(A.all.filter((f) => f.campaignId === c.id && f.periodStart >= selection.b.from && f.periodEnd <= selection.b.to).map((f) => f.measures));
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
    // Clear and real, never on a sliver of the budget.
    const verdict =
      breakdown !== "hour" && x.results < 10 && spendShare < 0.05 ? "small"
      : index !== null && index >= 1.25 && z >= 1.96 ? "best"
      : index !== null && index <= 0.75 && spendShare >= 0.05 && z <= -1.96 ? "costly"
      : "average";
    return { name: x.name, spend: x.spend, results: x.results, spendShare, resultShare, cost, index, z, verdict };
  });
  return { ...base, spend, results, avg, rows, basis, simulated: breakdown !== "weekday", unavailable: false };
}

export function metaFor(acctId?: string) {
  const A = account(acctId);
  const c = A.client;
  return {
    id: A.id, account: c.name, industry: c.industry, country: c.country ?? null, minDate: A.min, end: END,
    reports: A.rowsByPlatform.map(([platform, rows]) => ({ fileName: `${A.id}-${platform}-ads-daily.csv`, platform, from: A.min, to: END, rows })),
    targets: [...new Set(A.campaigns.map((x) => x.objective))].map((o) => {
      const g = c.goals.find((x) => x.objective === o);
      const mode: KpiMode = o === "sales" ? "roas" : o === "awareness" ? "cpm" : "cost";
      return { objective: o, label: OBJECTIVE_DEFS[o].label, kpiLabel: kpiLabel(o, mode), kpiShort: kpiShort(o, mode), mode, target: g?.target ?? null, marginPct: g?.marginPct ?? null, closePct: g?.leadToCustomerPct ?? null, profit: g?.profitPerCustomer ?? null };
    }),
    allObjectives: OBJECTIVES.map((o) => ({ objective: o, label: OBJECTIVE_DEFS[o].label })),
  };
}
