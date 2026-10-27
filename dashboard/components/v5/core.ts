// Shared, pure helpers for the v5 screens (prototype v5.1 is the spec: its
// docs/prototype/src/ui/00-core.js and 10-shared.js). Formatting, labels, the plain
// words Beginner sees and the small rules every view uses. No React, no server code.
import type { ViewModel } from "@/lib/analysis/viewModel";
import type { KpiMode } from "@/lib/metrics/objectives";

export type VM = ViewModel;
export type Item = VM["problems"][number];
export type Row = VM["levels"]["campaign"][number];
export type Goal = VM["objectives"][number];
export type Driver = NonNullable<Goal["drivers"]>[number];
export type Level = "campaign" | "ad_group" | "ad";
export type Mode = KpiMode | "neutral";

// ---------- numbers ----------
export { makeFmt, type Fmt } from "@/lib/fmt5";

export const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
export const n0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US"));
export const n1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));
export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
export const higher = (mode: Mode | string | null | undefined) => mode === "roas";

// ---------- dates (ISO yyyy-mm-dd, UTC) ----------
export const D0 = (s: string) => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => {
  const d = D0(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const fmtDate = (s: string) => D0(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const fmtDay = (s: string) => D0(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const range = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
export const days = (a: string, b: string) => Math.round((D0(b).getTime() - D0(a).getTime()) / 86400000) + 1;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------- labels ----------
export const PLATFORM: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google", linkedin: "LinkedIn" };
export const ROLE: Record<string, string> = { prospecting: "Prospecting", retargeting: "Retargeting", existing: "Existing customers", brand: "Brand search" };
export const STATE: Record<string, [string, string]> = {
  far_off: ["bad", "Far off"],
  off_track: ["warn", "Off track"],
  worse: ["bad", "Worse"],
  on_track: ["good", "On track"],
  better: ["good", "Better"],
  flat: ["flat", "Steady"],
  unknown: ["flat", "Not judged"],
};
export const KIND: Record<string, [string, "problem" | "opportunity" | "ok" | "wait"]> = {
  issue: ["Problem", "problem"],
  opportunity: ["Opportunity", "opportunity"],
  on_track: ["On track", "ok"],
  learning: ["Learning", "wait"],
  waiting: ["Not enough data", "wait"],
  signal: ["Early signal", "wait"],
};
export const LEVEL: Record<Level, string> = { campaign: "Campaign", ad_group: "Ad set", ad: "Ad" };
export const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, monitor: 3 };
export const CONF_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
export const OFF = ["far_off", "off_track", "worse"];
export const TONE: Record<string, "bad" | "warn" | "good" | "flat"> = { far_off: "bad", worse: "bad", off_track: "warn", on_track: "good", better: "good", flat: "flat", unknown: "flat" };
export const ICONCH = { good: "✓", warn: "!", bad: "✕", flat: "•" } as const;
export const DETECTOR_NAME: Record<string, string> = {
  plan: "Campaign plan", tracking_break: "Tracking break", post_click_drop: "Landing page / checkout drop", creative_fatigue: "Creative fatigue", cpm_spike: "Ad cost spike",
  wasted_spend: "Wasted spend", revenue_break: "Revenue tracking break", underperformer: "Underperformer", budget_concentration: "Budget concentration", saturation: "Audience saturation",
  kpi_worsened: "Result worsened", spend_up_results_down: "Spend up, results down", ad_ctr_drop: "Ad click-rate drop", zero_results_child: "Ad set / ad with no results", no_delivery: "No delivery",
  budget_winner: "Under-funded winner", strong_performer: "Ad worth copying", lesson_winner: "Lesson: winner", lesson_underperformer: "Lesson: avoid", cross_platform: "Cross-platform shift",
};
export const impactWord = (mode: string, worse: boolean) => (mode === "roas" ? (worse ? "lost revenue" : "extra revenue") : worse ? "extra cost" : "saved");

// ---------- items ----------
export const kindOf = (d: Pick<Item, "bucket" | "kind">) => (d.bucket === "problem" ? "issue" : d.bucket === "opportunity" ? "opportunity" : d.kind && KIND[d.kind] ? d.kind : "signal");
// Open = still waiting for a decision (the engine's todo / in review).
export const isOpen = (d: Pick<Item, "status">) => d.status === "todo" || d.status === "in_review";
export function statusText(d: Pick<Item, "status" | "until" | "dismissReason">) {
  if (d.status === "done") return "Action taken";
  if (d.status === "snoozed") return d.until ? `Reminder set for ${fmtDay(d.until)}` : "Reminder set";
  if (d.status === "dismissed") return `Dismissed${d.dismissReason ? `: ${d.dismissReason}` : ""}`;
  return "Open";
}
export const recheckOf = (d: Item) => (d.whatToDo ?? []).find((s) => /^Re-check/.test(s));
export const stepsOf = (d: Item) => (d.whatToDo ?? []).filter((s) => !/^Re-check/.test(s));
export const prReasonOf = (d: Item) => String(d.priorityReason ?? "").replace(/^(High|Medium|Low)( instead of high)?: /, "");
export const byImpact = (x: Item, y: Item) => (y.impact?.amount ?? 0) - (x.impact?.amount ?? 0);
export const allItems = (v: VM) => [...v.problems, ...v.opportunities, ...v.signals];
export function detailOf(v: VM, key: string | null | undefined): Item | null {
  if (!key) return null;
  return allItems(v).find((d) => d.key === key) ?? v.closed.find((d) => d.key === key) ?? (v.details[key] as Item | undefined) ?? null;
}
export const rowOf = (v: VM, e: { level: Level; id: string } | null | undefined) => (e ? (v.levels[e.level]?.find((r) => r.id === e.id) ?? null) : null);
// What opens when a campaign / ad set / ad is clicked: a problem found on that exact
// item is the richer view; otherwise its plan.
export function keyForEntity(v: VM, level: Level, id: string) {
  const p = [...v.problems, ...v.opportunities].find((x) => x.entity && x.entity.level === level && x.entity.id === id);
  return p?.key ?? v.levels[level].find((x) => x.id === id)?.planKey ?? null;
}
export const byGoalSpend = (v: VM) => [...v.objectives].sort((x, y) => y.spend - x.spend);
export const goalOf = (o: Goal) => ({ target: o.target, breakEven: o.breakEven, state: o.state });

// "Decisions waiting": open problems and opportunities that matter now.
export const decisions = (v: VM, shown: (d: Item) => boolean = () => true) =>
  [...v.problems, ...v.opportunities].filter((d) => isOpen(d) && shown(d) && (d.priority === "high" || d.priority === "medium"));
export const openProblems = (v: VM, shown: (d: Item) => boolean = () => true) => v.problems.filter((d) => isOpen(d) && shown(d));
// Items already decided (Action taken, a reminder, dismissed), each once.
export function decidedItems(v: VM) {
  const all = [...allItems(v), ...v.closed, ...(Object.values(v.details) as Item[])];
  return all.filter((d, i) => !isOpen(d) && all.findIndex((x) => x.key === d.key) === i);
}

// Open problems and opportunities ranked by the money involved (looking back).
export function optimizeQueue(v: VM, filter = "open", sort = "impact", shown: (d: Item) => boolean = () => true) {
  if (filter === "done") return decidedItems(v);
  const list = filter === "fix" ? v.problems : filter === "grow" ? v.opportunities : filter === "watch" ? v.signals : [...v.problems, ...v.opportunities];
  const known = (d: Item) => (d.impact?.known ? d.impact.amount : -1);
  const by: Record<string, (x: Item, y: Item) => number> = {
    impact: (x, y) => known(y) - known(x) || PRIO_RANK[x.priority] - PRIO_RANK[y.priority],
    priority: (x, y) => PRIO_RANK[x.priority] - PRIO_RANK[y.priority] || known(y) - known(x),
    confidence: (x, y) => CONF_RANK[x.confidence] - CONF_RANK[y.confidence] || known(y) - known(x),
  };
  return list.filter((d) => isOpen(d) && shown(d)).sort(by[sort] ?? by.impact);
}

// ---------- words ----------
// Ad terms explained on hover (Intermediate); Advanced sees them as-is.
export const GLOSS: Record<string, string> = {
  ROAS: "Return on ad spend: the sales you got back for every $1 spent on ads. 3.00× means $3 back for each $1.",
  CPA: "Cost per purchase: what one sale cost you in ads, on average.",
  CPL: "Cost per lead: what one lead (someone who filled in your form) cost you, on average.",
  CPC: "Cost per click: what one click to your website cost you, on average.",
  CPM: "Cost per 1,000 impressions: what it cost to show your ads 1,000 times.",
  CPE: "Cost per engagement: what one like, comment or share cost you.",
  CPV: "Cost per view: what one video view cost you.",
  CPI: "Cost per install: what one app install cost you.",
  CTR: "Click-through rate: out of everyone who saw the ad, the share who clicked it.",
  "Cost/conv.": "Cost per conversation: what one new message conversation cost you.",
  "Cost/follow": "Cost per follow: what one new follower or page like cost you.",
  "Cost/LPV": "Cost per landing page view: what one website visit (after the page loaded) cost you.",
  "Cost/reg.": "Cost per registration: what one app sign-up cost you.",
  "Cost/1K reach": "Cost per 1,000 people reached.",
  Frequency: "How many times, on average, each person saw your ads.",
  "Conversion rate": "Out of the people who clicked, the share who then did what you wanted (bought, signed up, messaged).",
};
// Beginner: the engine's ad terms in everyday words.
const PLAIN: [RegExp, string][] = [
  [/\bCost\/conv\./g, "cost per conversation"], [/\bCost\/follow\b/g, "cost per follow"], [/\bCost\/LPV\b/g, "cost per website visit"], [/\bCost\/reg\./g, "cost per sign-up"], [/\bCost\/1K reach\b/g, "cost per 1,000 people reached"],
  [/\bCPL\b/g, "cost per lead"], [/\bCPA\b/g, "cost per purchase"], [/\bCPC\b/g, "cost per click"], [/\bCPM\b/g, "cost per 1,000 views"], [/\bCPE\b/g, "cost per like or comment"], [/\bCPV\b/g, "cost per video view"], [/\bCPI\b/g, "cost per install"],
  [/\bROAS\b/g, "sales per $1 spent"], [/\bCTR\b/g, "click rate"], [/\bcreatives\b/g, "ad images or videos"], [/\bcreative\b/g, "ad image or video"], [/\bconversion rate\b/gi, "share of clickers who bought or signed up"],
];
export const plain = (s: string | null | undefined) => {
  const t = PLAIN.reduce((x, [re, w]) => x.replace(re, w), String(s ?? ""));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
// First sentence: ends at ". " + a capital letter (so "Cost/conv. $0.93" or "e.g. reels" don't cut it).
export const firstSentence = (s: string | null | undefined) => {
  const t = String(s ?? "");
  const m = /[.!?](?=\s+[A-Z‘“'"(]|\s*$)/.exec(t);
  return (m ? t.slice(0, m.index + 1) : t).trim();
};
export const singular = (o: { resultSingular?: string | null; resultLabel?: string | null }) => String(o.resultSingular ?? o.resultLabel ?? "result").replace(/s$/, "");
export const PRIO_PLAIN: Record<string, string> = { high: "Do this first", medium: "Worth doing this week", low: "When you have time", monitor: "Just keep an eye on it" };
export const CONF_PLAIN: Record<string, string> = { high: "Very sure: there’s plenty of data behind this.", medium: "Fairly sure, but keep an eye on it.", low: "Not sure yet: there’s little data, so treat this as an early sign." };
const DRV: Record<string, [string, string]> = {
  cpm: ["Ad cost (CPM)", "showing your ads got {more} expensive"],
  ctr: ["Click rate (CTR)", "{fewer} people clicked your ads"],
  cvr: ["Conversion rate", "{fewer} of the people who clicked went on to act"],
  rate: ["Result rate", "{fewer} of the people who saw the ads took action"],
  frequency: ["Frequency", "people saw your ads {more} often"],
  aov: ["Order value", "people spent {more} per order"],
};
export const drvName = (k: string, label: string) => DRV[k]?.[0] ?? label;
export const drvPlain = (dr: Driver) => {
  const up = dr.change > 0;
  return (DRV[dr.key]?.[1] ?? dr.label).replace("{more}", up ? "more" : "less").replace("{fewer}", up ? "more" : "fewer");
};
export const mainDriver = (drivers: Driver[] | null | undefined) => (drivers && drivers.length ? [...drivers].sort((x, y) => y.weight - x.weight)[0] : null);
export function driverSentence(drivers: Driver[] | null | undefined) {
  const m = mainDriver(drivers);
  if (!m || Math.abs(m.change) < 0.03) return "";
  return `Mainly because ${drvPlain(m)} (${drvName(m.key, m.label)} ${signed(m.change)}), which explains about ${Math.round(m.weight * 100)}% of the change.`;
}

// ---------- the period ----------
export type Period = { from: string; to: string; name?: string };
// Calendar days, weeks (Mon–Sun) and months that have data, ending on the latest day (end).
// The date picker's quick ranges (laid out like Madgicx's), counted back from the
// latest day in the uploads, not from today: reports arrive with a delay. A range
// that starts before the first upload can't be chosen.
export type Preset = Period & { id: string; name: string; ok: boolean };
export function presets(end: string, min: string): Preset[] {
  const mon = addDays(end, -((D0(end).getUTCDay() + 6) % 7));
  const e = D0(end);
  const m1 = iso(new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1)));
  const pm1 = iso(new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, 1)));
  const back = (n: number) => ({ from: addDays(end, -(n - 1)), to: end });
  const list: (Period & { id: string; name: string })[] = [
    { id: "latest", name: "Latest day", from: end, to: end },
    { id: "daybefore", name: "Day before", from: addDays(end, -1), to: addDays(end, -1) },
    { id: "thisweek", name: "This week (Mon – latest)", from: mon, to: end },
    { id: "last7", name: "Last 7 days", ...back(7) },
    { id: "lastweek", name: "Last week (Mon – Sun)", from: addDays(mon, -7), to: addDays(mon, -1) },
    { id: "last14", name: "Last 14 days", ...back(14) },
    { id: "last28", name: "Last 28 days", ...back(28) },
    { id: "last30", name: "Last 30 days", ...back(30) },
    { id: "thismonth", name: "This month", from: m1, to: end },
    { id: "lastmonth", name: "Last month", from: pm1, to: addDays(m1, -1) },
    { id: "last90", name: "Last 90 days", ...back(90) },
  ];
  return list.map((p) => ({ ...p, ok: p.from >= min }));
}
// What a period is compared with. "previous" is the engine's own rule (prevOf).
export type CompareMode = "previous" | "weekday" | "year" | "custom";
export function compareRange(a: Period, mode: CompareMode): Period | null {
  if (mode === "previous") return prevOf(a);
  if (mode === "weekday") {
    const n = Math.ceil(days(a.from, a.to) / 7) * 7;
    return { from: addDays(a.from, -n), to: addDays(a.to, -n) };
  }
  if (mode === "year") return { from: addDays(a.from, -364), to: addDays(a.to, -364) };
  return null;
}
export function choices(kind: string, end: string, min: string): (Period & { small: string })[] {
  if (kind === "day") return Array.from({ length: 21 }, (_, i) => addDays(end, -i)).filter((d) => d >= min).map((d, i) => ({ from: d, to: d, name: fmtDay(d), small: i === 0 ? "latest day" : "" }));
  if (kind === "week") {
    const mon = addDays(end, -((D0(end).getUTCDay() + 6) % 7));
    const out = [{ from: addDays(end, -6), to: end, name: "Last 7 days", small: range(addDays(end, -6), end) }];
    for (let i = 0; i < 12; i++) {
      const f = addDays(mon, -7 * i);
      const t = i === 0 ? end : addDays(f, 6);
      if (f < min) break;
      out.push({ from: f, to: t, name: range(f, t), small: i === 0 ? "this week so far" : `week of ${fmtDate(f)}` });
    }
    return out;
  }
  if (kind === "month") {
    const out = [{ from: addDays(end, -29), to: end, name: "Last 30 days", small: range(addDays(end, -29), end) }];
    let y = D0(end).getUTCFullYear();
    let m = D0(end).getUTCMonth();
    for (let i = 0; i < 4; i++) {
      const f = iso(new Date(Date.UTC(y, m, 1)));
      const last = iso(new Date(Date.UTC(y, m + 1, 0)));
      if (last < min) break;
      const from = f < min ? min : f;
      const to = last > end ? end : last;
      out.push({ from, to, name: D0(f).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }), small: to < last ? "so far" : from > f ? `from ${fmtDate(from)}` : "full month" });
      m--;
      if (m < 0) {
        m = 11;
        y--;
      }
    }
    return out;
  }
  return [];
}
// The engine's "previous period": a full month → the month before; otherwise the same number of days right before.
export function prevOf(a: Period): Period {
  const f = D0(a.from);
  const full = f.getUTCDate() === 1 && addDays(a.to, 1).slice(8) === "01";
  if (full) return { from: iso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1))), to: addDays(a.from, -1) };
  const n = days(a.from, a.to);
  return { from: addDays(a.from, -n), to: addDays(a.from, -1) };
}
// A preset (Last 7 days, a week, a month) keeps its tab; anything else opens the calendar.
export function guessKind(p: Period, end: string, min: string) {
  for (const k of ["day", "week", "month"]) if (choices(k, end, min).some((c) => c.from === p.from && c.to === p.to)) return k;
  return "custom";
}
export function presetName(p: Period, end: string, min: string) {
  // Single days keep their date ("Mon, Oct 26"); the rest read "Last 14 days", "This week".
  const q = presets(end, min).find((x) => x.from === p.from && x.to === p.to && x.from !== x.to);
  if (q) return q.name.replace(/ \(.*\)$/, "");
  for (const k of ["week", "month", "day"]) {
    const c = choices(k, end, min).find((x) => x.from === p.from && x.to === p.to);
    if (c) return c.name;
  }
  return null;
}
