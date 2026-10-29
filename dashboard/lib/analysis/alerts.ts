// Alerts (prototype v5.1, ui/45-budget-alerts.js): automatic alerts that compare every
// campaign with its own past and with its target, and the user's own KPI alerts.
// Pure functions over the page's view model, shared by the Alerts page, the menu
// badge and the Telegram message, so all three always agree.
import { OBJECTIVE_DEFS, type Objective } from "../metrics/objectives";
import type { Fmt } from "../fmt5";
import type { ViewModel } from "./viewModel";

type Row = ViewModel["levels"]["campaign"][number];

export interface AlertConfig {
  on: boolean; // automatic alerts on or off
  past: boolean; // compare each campaign with its own past
  target: boolean; // … and with its target
  sens: "auto" | "pct"; // "AdMate decides" or the user's own percentage
  pct: number;
  good: boolean; // also report clear improvements
  muted: string[]; // automatic checks switched off (they stop appearing in lists)
}
export const ALERT_DEFAULT: AlertConfig = { on: true, past: true, target: true, sens: "auto", pct: 20, good: false, muted: [] };

export function parseAlertConfig(x: unknown): AlertConfig {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Record<keyof AlertConfig, unknown>>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const pct = Number(o.pct);
  return {
    on: bool(o.on, ALERT_DEFAULT.on),
    past: bool(o.past, ALERT_DEFAULT.past),
    target: bool(o.target, ALERT_DEFAULT.target),
    sens: o.sens === "pct" ? "pct" : "auto",
    pct: Number.isFinite(pct) && pct >= 1 && pct <= 300 ? Math.round(pct) : ALERT_DEFAULT.pct,
    good: bool(o.good, ALERT_DEFAULT.good),
    muted: Array.isArray(o.muted) ? o.muted.filter((m): m is string => typeof m === "string").slice(0, 50) : [],
  };
}

// ---------- the user's own KPI alerts ----------
export interface Rule {
  id: string;
  metric: RuleMetric;
  op: "by" | "above" | "below";
  value: number;
  scope: string; // all | obj:<objective> | c:<campaign id>
  on: boolean;
}
export const RULE_METRICS = {
  worse: { label: "Main result got worse by (%)", ops: ["by"], needsScope: false },
  kpi: { label: "Main result (cost per result or ROAS)", ops: ["above", "below"], needsScope: true },
  ctr: { label: "CTR (%)", ops: ["below", "above"], needsScope: false },
  cpm: { label: "CPM ($)", ops: ["above", "below"], needsScope: false },
  frequency: { label: "Frequency", ops: ["above", "below"], needsScope: false },
  spend: { label: "Spend in the period ($)", ops: ["above", "below"], needsScope: false },
  results: { label: "Results in the period", ops: ["below", "above"], needsScope: false },
} as const;
export type RuleMetric = keyof typeof RULE_METRICS;
export const isRuleMetric = (x: unknown): x is RuleMetric => typeof x === "string" && x in RULE_METRICS;

const higher = (mode: string) => mode === "roas";
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const label = (m: RuleMetric) => RULE_METRICS[m].label.replace(/ \(.*\)$/, "");

export function ruleValue(rule: Pick<Rule, "metric">, r: Row): number | null {
  if (rule.metric === "worse") return r.change == null ? null : (higher(r.mode) ? -r.change : r.change) * 100;
  if (rule.metric === "kpi") return r.kpi;
  if (rule.metric === "ctr") return r.ctr == null ? null : r.ctr * 100;
  if (rule.metric === "results") return r.mode === "cpm" ? null : r.results;
  if (rule.metric === "cpm") return r.cpm;
  if (rule.metric === "frequency") return r.frequency;
  return r.spend;
}
export function scopeRows(rule: Pick<Rule, "scope">, v: ViewModel): Row[] {
  if (rule.scope.startsWith("obj:")) return v.levels.campaign.filter((r) => r.objective === rule.scope.slice(4));
  if (rule.scope.startsWith("c:")) return v.levels.campaign.filter((r) => r.id === rule.scope.slice(2));
  return v.levels.campaign;
}
export type Fired = { rule: Rule; r: Row; x: number };
export function alertsFired(v: ViewModel, rules: Rule[]): Fired[] {
  const out: Fired[] = [];
  for (const rule of rules) {
    if (!rule.on) continue;
    for (const r of scopeRows(rule, v)) {
      const x = ruleValue(rule, r);
      if (x == null) continue;
      if (rule.op === "below" ? x < rule.value : x > rule.value) out.push({ rule, r, x });
    }
  }
  return out;
}
export function scopeLabel(s: string, v: ViewModel) {
  if (s === "all") return "any campaign";
  if (s.startsWith("obj:")) return `${OBJECTIVE_DEFS[s.slice(4) as Objective]?.label ?? s} campaigns`;
  return `“${v.levels.campaign.find((r) => r.id === s.slice(2))?.name ?? "a campaign"}”`;
}
export function ruleText(rule: Rule, v: ViewModel, f: Fmt) {
  if (rule.metric === "worse") return `Main result more than ${rule.value}% worse than the comparison period · ${scopeLabel(rule.scope, v)}`;
  const val = rule.metric === "ctr" ? `${rule.value}%` : rule.metric === "cpm" || rule.metric === "spend" ? f.money(rule.value) : String(rule.value);
  return `${label(rule.metric)} ${rule.op} ${val} · ${scopeLabel(rule.scope, v)}`;
}
export function firedText(x: Fired, f: Fmt) {
  if (x.rule.metric === "worse") return `Main result ${Math.round(x.x)}% worse`;
  const m = x.rule.metric;
  const val = m === "kpi" ? f.kpi(x.x, x.r.mode) : m === "ctr" ? `${x.x.toFixed(2)}%` : m === "cpm" || m === "spend" ? f.money(x.x) : m === "frequency" ? x.x.toFixed(1) : Math.round(x.x).toLocaleString("en-US");
  return `${label(m)}: ${val}`;
}
// Starting points, including "below break-even" when the sales goal has a margin.
export function ruleTemplates(v: ViewModel): { name: string; rule: Omit<Rule, "id" | "on"> }[] {
  const t: { name: string; rule: Omit<Rule, "id" | "on"> }[] = [
    { name: "Main result 30%+ worse", rule: { metric: "worse", op: "by", value: 30, scope: "all" } },
    { name: "Frequency above 3", rule: { metric: "frequency", op: "above", value: 3, scope: "all" } },
    { name: "CTR below 0.8%", rule: { metric: "ctr", op: "below", value: 0.8, scope: "all" } },
  ];
  const sales = v.objectives.find((o) => o.objective === "sales");
  if (sales?.breakEven && v.levels.campaign.some((r) => r.objective === "sales"))
    t.push({ name: `ROAS below break-even (${sales.breakEven.toFixed(2)}×)`, rule: { metric: "kpi", op: "below", value: +sales.breakEven.toFixed(2), scope: "obj:sales" } });
  return t;
}

// ---------- automatic alerts ----------
// A campaign's own target counts only in the unit it is judged by; otherwise the
// goal's target stands in when it is in that same unit.
export type CampaignTargets = Record<string, { mode: string; value: number }>;
export const ownTarget = (r: Row, own: CampaignTargets) => {
  const t = own[r.id];
  return t && t.mode === r.mode && t.value > 0 ? t.value : null;
};
export const goalTarget = (r: Row, v: ViewModel) => {
  const g = v.objectives.find((o) => o.objective === r.objective);
  return g && g.mode === r.mode && g.target != null && g.target > 0 ? g.target : null;
};
export function campaignTarget(r: Row, v: ViewModel, own: CampaignTargets) {
  const o = ownTarget(r, own);
  const g = goalTarget(r, v);
  return o != null ? { value: o, own: true } : g != null ? { value: g, own: false } : null;
}
// Share by which a result is worse than a base (positive = worse, negative = better).
export const worseBy = (val: number | null, base: number, mode: string) => (base > 0 && val != null ? (higher(mode) ? (base - val) / base : (val - base) / base) : null);

export type Auto = { r: Row; basis: "past" | "target"; base: number; own?: boolean; w: number; good: boolean; sure: boolean };
export function autoAlerts(v: ViewModel, cfg: AlertConfig, own: CampaignTargets): Auto[] {
  if (!cfg.on) return [];
  const lim = cfg.sens === "pct" ? Math.max(0.01, cfg.pct / 100) : null;
  const out: Auto[] = [];
  for (const r of v.levels.campaign) {
    if (r.kpi == null) continue;
    const sure = r.confidence !== "low";
    const enough = r.mode === "cpm" ? r.impressions >= 1000 : (r.results ?? 0) >= 10;
    if (cfg.past && r.kpiA != null && v.compareLabel) {
      const w = worseBy(r.kpi, r.kpiA, r.mode)!;
      // "AdMate decides": a change of 20% or more that the significance test backs up.
      const bad = lim != null ? w >= lim : w >= 0.2 && sure;
      const good = cfg.good && (lim != null ? -w >= lim : -w >= 0.2 && sure);
      if (bad || good) out.push({ r, basis: "past", base: r.kpiA, w, good: !bad, sure });
    }
    if (cfg.target) {
      const t = campaignTarget(r, v, own);
      if (t) {
        const w = worseBy(r.kpi, t.value, r.mode)!;
        // "AdMate decides": more than 10% off target, on at least 10 results.
        const bad = enough && (lim != null ? w >= lim : w > 0.1);
        const good = cfg.good && enough && (lim != null ? -w >= lim : -w > 0.1);
        if (bad || good) out.push({ r, basis: "target", base: t.value, own: t.own, w, good: !bad, sure });
      }
    }
  }
  return out.sort((a, b) => Number(a.good) - Number(b.good) || b.w - a.w);
}
export function autoText(a: Auto, v: ViewModel, f: Fmt) {
  const r = a.r;
  const k = (x: number | null) => f.kpi(x, r.mode);
  const p = Math.round(Math.abs(a.w) * 100);
  return a.basis === "past"
    ? `${r.kpiShort} ${k(r.kpi)} vs ${k(a.base)} in ${v.compareLabel}: ${p}% ${a.good ? "better" : "worse"}${a.sure ? "" : " (little data: an early sign)"}`
    : `${r.kpiShort} ${k(r.kpi)} vs ${a.own ? "its own target" : "the goal target"} ${k(a.base)}: ${p}% ${a.good ? "better" : "worse"}`;
}
// The menu badge: automatic alerts that are bad news, plus the user's alerts that fired.
export const alertCount = (v: ViewModel, cfg: AlertConfig, rules: Rule[], own: CampaignTargets) => alertsFired(v, rules).length + autoAlerts(v, cfg, own).filter((a) => !a.good).length;

// ---------- the Telegram message ----------
export function alertLines(v: ViewModel, cfg: AlertConfig, rules: Rule[], own: CampaignTargets, f: Fmt) {
  return [
    ...autoAlerts(v, cfg, own).map((a) => `${a.good ? "Good news" : "Alert"} · ${a.r.name}: ${autoText(a, v, f)}`),
    ...alertsFired(v, rules).map((x) => `Your alert · ${x.r.name}: ${firedText(x, f)}`),
  ];
}
// The alert digest: one structured message, rendered as Telegram HTML for sending and
// as a lifelike preview in AdMate. Built the way the big ad platforms and alerting
// tools write theirs: the first two lines (all a phone notification shows) say how
// many campaigns need attention and how much money is involved; campaigns are grouped
// by urgency; each gets one short block — the number, how it changed, what it cost
// and the next step; at most five, then "+N more"; one button to open AdMate.
export type DigestSev = "urgent" | "watch" | "good";
export interface DigestItem {
  sev: DigestSev;
  name: string;
  platform: string;
  metric: string; // "ROAS 1.73×"
  vs: string[]; // ["was 3.02× (43% worse)", "target 3.00× (42% below)"]
  money: string | null; // "$809 lost revenue"
  next: string | null; // the step AdMate suggests
  early: boolean; // little data: an early sign
}
export interface Digest {
  account: string;
  period: string; // "Oct 10–16 vs Oct 3–9"
  headline: string;
  sub: string;
  groups: { sev: DigestSev; title: string; items: DigestItem[] }[];
  rules: { name: string; text: string; limit: string }[];
  more: number;
  allClear: boolean;
  stake: string | null; // "$1,030" at stake across the campaigns that need attention
  // Campaigns doing great where AdMate suggests more budget (the Overview's "Doing
  // great: consider more budget"), so the alert shows what to grow, not only what to fix.
  scale: { name: string; platform: string; metric: string; action: string | null }[];
}
const SEV_TITLE: Record<DigestSev, string> = { urgent: "Act now", watch: "Keep an eye on", good: "Going well" };
export const SEV_ICON: Record<DigestSev, string> = { urgent: "🔴", watch: "🟠", good: "🟢" };
const MAX_ITEMS = 5;
const MAX_SCALE = 2;

export function alertDigest(account: string, v: ViewModel, cfg: AlertConfig, rules: Rule[], own: CampaignTargets, f: Fmt): Digest {
  const auto = autoAlerts(v, cfg, own);
  const fired = alertsFired(v, rules);
  const period = `${v.label}${v.compareLabel ? ` vs ${v.compareLabel}` : ""}`;
  // One block per campaign, even when it is off both its past and its target.
  const by = new Map<string, Auto[]>();
  for (const a of auto) by.set(a.r.id, [...(by.get(a.r.id) ?? []), a]);
  const items: (DigestItem & { stake: number; w: number })[] = [];
  for (const list of by.values()) {
    const r = list[0].r;
    const good = list.every((a) => a.good);
    const bad = list.filter((a) => !a.good);
    const w = Math.max(...(good ? list : bad).map((a) => Math.abs(a.w)));
    const sure = (good ? list : bad).some((a) => a.sure);
    const k = (x: number | null) => f.kpi(x, r.mode);
    const vs = (good ? list : bad).map((a) => {
      const p = Math.round(Math.abs(a.w) * 100);
      if (a.basis === "past") return `was ${k(a.base)} in ${v.compareLabel} (${p}% ${a.good ? "better" : "worse"})`;
      const side = higher(r.mode) === !a.good ? "below" : "above";
      return `${a.own ? "its target" : "goal target"} ${k(a.base)} (${p}% ${side})`;
    });
    const im = r.impact;
    const loss = im && im.known && im.amount >= 1 && (good ? im.label === "saved" || im.label === "extra revenue" : im.label === "extra cost" || im.label === "lost revenue");
    const problem = v.problems.find((d) => d.entity?.level === "campaign" && d.entity.id === r.id && (d.status === "todo" || d.status === "in_review"));
    const next = good ? (r.label ?? null) : (problem?.title ?? r.label ?? null);
    items.push({
      sev: good ? "good" : w > 0.3 && sure ? "urgent" : "watch",
      name: r.name,
      platform: r.platform,
      metric: `${r.kpiLabel} ${k(r.kpi)}`,
      vs,
      money: loss ? `${f.money(im!.amount)} ${im!.label}` : null,
      next,
      early: !sure,
      stake: loss && !good ? im!.amount : 0,
      w,
    });
  }
  // Budget candidates the person hasn't already decided on; while alerts are off, none.
  const scale = (cfg.on ? v.great : [])
    .filter((g) => !v.closed.some((c) => c.key === g.key))
    .slice(0, MAX_SCALE)
    .map((g) => ({ name: g.campaign ?? "", platform: g.platform ?? "", metric: g.kpi, action: g.action ?? null }))
    .filter((g) => g.name);
  // A campaign listed for more budget isn't repeated as good news.
  for (let i = items.length - 1; i >= 0; i--) if (items[i].sev === "good" && scale.some((g) => g.name === items[i].name)) items.splice(i, 1);
  const order: DigestSev[] = ["urgent", "watch", "good"];
  items.sort((x, y) => order.indexOf(x.sev) - order.indexOf(y.sev) || y.stake - x.stake || y.w - x.w);
  const shown = items.slice(0, MAX_ITEMS);
  const ruleRows = fired.slice(0, Math.max(0, MAX_ITEMS - shown.length) || 3).map((x) => ({
    name: x.r.name,
    text: firedText(x, f),
    limit: `your alert: ${x.rule.metric === "worse" ? `more than ${x.rule.value}% worse` : `${label(x.rule.metric)} ${x.rule.op} ${x.rule.metric === "ctr" ? `${x.rule.value}%` : x.rule.metric === "cpm" || x.rule.metric === "spend" ? f.money(x.rule.value) : x.rule.value}`}`,
  }));
  const needs = items.filter((i) => i.sev !== "good").length;
  const stake = items.reduce((s, i) => s + i.stake, 0);
  const goodN = items.length - needs;
  const headline = needs
    ? `${account}: ${plural(needs, "campaign")} ${needs === 1 ? "needs" : "need"} attention`
    : fired.length
      ? `${account}: ${plural(fired.length, "of your alerts")} fired`
      : scale.length
        ? `${account}: ${plural(scale.length, "campaign")} ready for more budget`
        : goodN
          ? `${account}: good news on ${plural(goodN, "campaign")}`
          : `${account}: all clear`;
  const sub = [period, stake >= 1 ? `${f.money(stake)} at stake` : null, scale.length && (needs || fired.length) ? `${scale.length} to grow` : null, !needs && !fired.length && !goodN && !scale.length ? "every campaign is within your settings" : null].filter(Boolean).join(" · ");
  return {
    account,
    period,
    headline,
    sub,
    groups: order.map((sev) => ({ sev, title: SEV_TITLE[sev], items: shown.filter((i) => i.sev === sev) })).filter((g) => g.items.length),
    rules: ruleRows,
    more: items.length - shown.length + (fired.length - ruleRows.length),
    allClear: !items.length && !fired.length && !scale.length,
    stake: stake >= 1 ? f.money(stake) : null,
    scale,
  };
}
export const digestIcon = (d: Digest) => (d.groups.some((g) => g.sev === "urgent") ? "🔴" : d.groups.some((g) => g.sev === "watch") || d.rules.length ? "🟠" : "✅");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Telegram's HTML mode: <b>, <i> and line breaks only, so it reads the same on every phone.
export function digestHtml(d: Digest) {
  const out = [`${digestIcon(d)} <b>${esc(d.headline)}</b>`, esc(d.sub)];
  let n = 0;
  for (const g of d.groups) {
    out.push("", `${SEV_ICON[g.sev]} <b>${g.title.toUpperCase()}</b>`);
    for (const i of g.items) {
      n++;
      out.push("", `<b>${n}. ${esc(i.name)}</b>${i.early ? " <i>(early sign)</i>" : ""}`, `${esc(i.metric)} · ${esc(i.vs.join(" · "))}`);
      if (i.money) out.push(`💸 ${esc(i.money)}`);
      if (i.next) out.push(`👉 ${esc(i.next)}`);
    }
  }
  if (d.rules.length) {
    out.push("", "📌 <b>YOUR ALERTS</b>");
    for (const r of d.rules) out.push(`• <b>${esc(r.name)}</b>: ${esc(r.text)} <i>(${esc(r.limit)})</i>`);
  }
  if (d.scale.length) {
    out.push("", "💰 <b>CONSIDER MORE BUDGET</b>");
    for (const g of d.scale) {
      out.push("", `<b>${esc(g.name)}</b>`, esc(g.metric));
      if (g.action) out.push(`👉 ${esc(g.action)}`);
    }
  }
  if (d.more > 0) out.push("", `+${d.more} more in AdMate`);
  out.push("", "<i>Looking back only, not a forecast. AdMate never changes your ads.</i>");
  return out.join("\n");
}

export function telegramMessage(account: string, v: ViewModel, lines: string[]) {
  const head = `AdMate · ${account} · ${v.label}`;
  if (!lines.length) return `${head}\nNo alerts: every campaign is within your settings.`;
  return `${head}\n${plural(lines.length, "alert")}:\n${lines
    .slice(0, 6)
    .map((l) => `• ${l}`)
    .join("\n")}${lines.length > 6 ? `\n…and ${lines.length - 6} more in AdMate.` : ""}\n\nOpen AdMate to see why and what to do.`;
}
