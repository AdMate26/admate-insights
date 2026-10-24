// Core: the engine handle, formatting, app state, the selected period and data access.
// Every number on screen comes from E: AdMate's real engine, running in this page on
// the sample accounts (lib/ via entry.ts).
const E = window.AdMateEngine;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const money = (v) => (v == null || !isFinite(v) ? "—" : v === 0 ? "$0" : (v < 0 ? "−$" : "$") + (Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v) >= 0.1 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(3)));
const kpi = (v, mode) => (v == null || !isFinite(v) ? "—" : mode === "roas" ? v.toFixed(2) + "×" : money(v));
const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(d) + "%");
const n0 = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US"));
const n1 = (v) => (v == null || !isFinite(v) ? "—" : v.toFixed(1));
const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 100)) + "%";
const higher = (mode) => mode === "roas";
const D0 = (s) => new Date(s + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D0(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const fmtDate = (s) => D0(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (s) => D0(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const range = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
const days = (a, b) => Math.round((D0(b) - D0(a)) / 86400000) + 1;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLATFORM = { meta: "Meta", tiktok: "TikTok", google: "Google", linkedin: "LinkedIn" };
const ROLE = { prospecting: "Prospecting", retargeting: "Retargeting", existing: "Existing customers", brand: "Brand search" };
const STATE = { far_off: ["bad", "Far off"], off_track: ["warn", "Off track"], worse: ["bad", "Worse"], on_track: ["good", "On track"], better: ["good", "Better"], flat: ["flat", "Steady"], unknown: ["flat", "Not judged"] };
const KIND = { issue: ["Problem", "problem"], opportunity: ["Opportunity", "opportunity"], on_track: ["On track", "ok"], learning: ["Learning", "wait"], waiting: ["Not enough data", "wait"], signal: ["Early signal", "wait"] };
const LEVEL = { campaign: "Campaign", ad_group: "Ad set", ad: "Ad" };
const END = E.END;
const ACCTS = E.accounts();

// Per-viewer settings saved in this browser (level, account, alert rules, saved views).
// Where the browser blocks storage, they last until the page closes.
const MEM = {};
const LS = {
  get(k) { try { return localStorage.getItem(k) ?? MEM[k] ?? null; } catch { return MEM[k] ?? null; } },
  set(k, v) { MEM[k] = v; try { localStorage.setItem(k, v); } catch {} },
  json(k, d) { try { return JSON.parse(LS.get(k)) ?? d; } catch { return d; } },
  put(k, v) { LS.set(k, JSON.stringify(v)); },
};

// ---------- the three views ----------
const XP = {
  beginner: { name: "Beginner", job: "Understand", who: "New to ads, or you just want to know what to do.", see: ["“Am I doing OK?” in one sentence", "The biggest problem and the one next step", "Plain words, simple charts"], example: "“Each conversation cost you $0.93. Your goal is $1.20, so you’re on track.”" },
  intermediate: { name: "Intermediate", job: "Analyze & optimize", who: "You run your own ads and know the basics: budget, ad sets, cost per result.", see: ["What changed and why (click rate, ad cost, conversion)", "Optimizations ranked by money at stake", "Compare campaigns, audiences and creatives"], example: "“Cost/conv. +42% vs Oct 3–9. Main driver: click rate −32%.”" },
  advanced: { name: "Advanced", job: "Control & scale", who: "You manage ads daily, or for several clients, and want speed and control.", see: ["All your accounts in one portfolio", "Custom tables, filters, saved views, bulk actions", "Budget allocation and your own alert rules"], example: "“4 accounts · $612 at stake · 3 alerts fired · 2 campaigns to scale”" },
};
let xp = XP[LS.get("admate-level")] ? LS.get("admate-level") : null;
const L = () => xp ?? "intermediate";
const isBeg = () => L() === "beginner";
const isAdv = () => L() === "advanced";

// ---------- account + per-account state ----------
let acct = ACCTS.some((a) => a.id === LS.get("admate-acct")) ? LS.get("admate-acct") : "lotus";
const metaCache = {};
const M = (id = acct) => (metaCache[id] ??= E.metaFor(id));
const acctName = (id = acct) => ACCTS.find((a) => a.id === id)?.name ?? "";
const targetsBy = {};
const targetsFor = (id = acct) => (targetsBy[id] ??= Object.fromEntries(M(id).targets.map((t) => [t.objective, { ...t }])));
// Decisions on items (session only; item keys are unique across accounts).
const decided = {};
const roles = {}, objectiveOverride = {};
// Automatic checks switched off in Advanced → Alerts (they stop appearing in lists).
let muted = new Set(LS.json("admate-muted", []));

let view = null; // the page on screen
let current = null; // the item open in the drawer
const ui = {
  todoShowDone: false, myAdsFilter: "all", begMoreGoals: false,
  optFilter: "open", optSort: "impact", moreGoals: false, trendObj: null,
  campLevel: "campaign", objFilter: null, expanded: new Set(), compare: new Set(),
  audTab: "audiences", aud: { target: null, breakdown: "age_gender" },
  actFilter: "open", actSort: "impact", actSel: new Set(), actPrio: "all",
  budgetObj: null,
};

// ---------- the period: what to show (a) and what to compare it with (b) ----------
const sel = { a: { from: addDays(END, -6), to: END, name: "Last 7 days" }, cmp: "previous", b: null };
function params() {
  const p = { from: sel.a.from, to: sel.a.to };
  if (sel.cmp === "none") p.cmp = "none";
  else if (sel.cmp === "pick" && sel.b) Object.assign(p, { cmp: "custom", cfrom: sel.b.from, cto: sel.b.to });
  else p.cmp = "previous";
  return p;
}
const vcache = new Map();
function V(id = acct) {
  const k = id + "|" + JSON.stringify(params());
  if (!vcache.has(k)) vcache.set(k, E.view(params(), id));
  return vcache.get(k);
}
const MIN = () => M().minDate;

// Calendar days, weeks (Mon–Sun) and months that have data.
function choices(kind) {
  const min = MIN();
  if (kind === "day") return Array.from({ length: 21 }, (_, i) => { const d = addDays(END, -i); return { from: d, to: d, name: fmtDay(d), small: i === 0 ? "latest day" : "" }; });
  if (kind === "week") {
    const mon = addDays(END, -((D0(END).getUTCDay() + 6) % 7));
    const out = [{ from: addDays(END, -6), to: END, name: "Last 7 days", small: range(addDays(END, -6), END) }];
    for (let i = 0; i < 12; i++) {
      const f = addDays(mon, -7 * i), t = i === 0 ? END : addDays(f, 6);
      if (f < min) break;
      out.push({ from: f, to: t, name: range(f, t), small: i === 0 ? "this week so far" : `week of ${fmtDate(f)}` });
    }
    return out;
  }
  if (kind === "month") {
    const out = [{ from: addDays(END, -29), to: END, name: "Last 30 days", small: range(addDays(END, -29), END) }];
    let y = D0(END).getUTCFullYear(), m = D0(END).getUTCMonth();
    for (let i = 0; i < 4; i++) {
      const f = iso(new Date(Date.UTC(y, m, 1))), last = iso(new Date(Date.UTC(y, m + 1, 0)));
      const from = f < min ? min : f, to = last > END ? END : last;
      out.push({ from, to, name: D0(f).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }), small: to < last ? "so far" : from > f ? `from ${fmtDate(from)}` : "full month" });
      m--; if (m < 0) { m = 11; y--; }
    }
    return out;
  }
  return [];
}
// The engine's "previous period": a full month → the month before; otherwise the same number of days right before.
function prevOf(a) {
  const f = D0(a.from), full = f.getUTCDate() === 1 && addDays(a.to, 1).slice(8) === "01";
  if (full) { const pf = iso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1))); return { from: pf, to: addDays(a.from, -1) }; }
  const n = days(a.from, a.to);
  return { from: addDays(a.from, -n), to: addDays(a.from, -1) };
}

// ---------- goals: same rules as lib/analysis/goalStatus.ts, so editing a target re-judges ----------
function breakEven(t) {
  if (!t) return null;
  if (t.objective === "sales" && t.marginPct > 0) return 1 / (t.marginPct / 100);
  if ((t.objective === "leads" || t.objective === "messages") && t.closePct > 0 && t.profit > 0) return (t.closePct / 100) * t.profit;
  return null;
}
function goalOf(o, targets = targetsFor()) {
  const t = targets[o.objective], be = o.mode !== "cpm" ? breakEven(t) : null;
  const yard = o.mode === "cpm" ? null : t?.target > 0 ? t.target : be;
  let state;
  if (yard != null && o.value != null) {
    const worse = higher(o.mode) ? 1 - o.value / yard : o.value / yard - 1;
    const below = be != null && (higher(o.mode) ? o.value < be : o.value > be);
    state = below || worse > 0.3 ? "far_off" : worse > 0.1 ? "off_track" : "on_track";
  } else if (o.change != null) state = Math.abs(o.change) <= 0.03 ? "flat" : (higher(o.mode) ? o.change > 0 : o.change < 0) ? "better" : "worse";
  else state = "unknown";
  return { target: o.mode !== "cpm" && t?.target > 0 ? t.target : null, breakEven: be, state };
}
const byGoalSpend = (v) => [...v.objectives].sort((x, y) => y.spend - x.spend);

// ---------- items (problems, opportunities, early signals) ----------
const allItems = (v = V()) => [...v.problems, ...v.opportunities, ...v.signals];
const detailOf = (key, v = V()) => (key ? allItems(v).find((d) => d.key === key) ?? v.details[key] ?? null : null);
const isOpen = (d) => !decided[d.key];
const shown = (d) => !muted.has(d.detector);
const decisions = (v = V()) => [...v.problems, ...v.opportunities].filter((d) => isOpen(d) && shown(d) && (d.priority === "high" || d.priority === "medium"));
const openProblems = (v = V()) => v.problems.filter((d) => isOpen(d) && shown(d));
const byImpact = (x, y) => (y.impact?.amount ?? 0) - (x.impact?.amount ?? 0);
const PRIO_RANK = { high: 0, medium: 1, low: 2, monitor: 3 };
const CONF_RANK = { high: 0, medium: 1, low: 2 };
// What opens when a campaign / ad set / ad is clicked: a problem found on that exact
// item is the richer view; otherwise its plan.
function keyForEntity(level, id, v = V()) {
  const p = [...v.problems, ...v.opportunities].find((x) => x.entity && x.entity.level === level && x.entity.id === id);
  return p?.key ?? v.levels[level].find((x) => x.id === id)?.planKey ?? null;
}
const rowOf = (entity, v = V()) => (entity ? v.levels[entity.level]?.find((r) => r.id === entity.id) ?? null : null);
