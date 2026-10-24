// Shared building blocks used by all three views: chips and tags, charts, plain-language
// helpers, the item panel (three depths), the welcome question, the account and view
// switchers, the page header, the period picker and the summary report.

// ---------- chips + tags ----------
const ICON = {
  problem: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 10.5H1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 4.6v2.6M6 8.7v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  opportunity: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.5V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ok: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wait: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/></svg>',
};
const kindOf = (d) => (d.bucket === "problem" ? "issue" : d.bucket === "opportunity" ? "opportunity" : d.kind && KIND[d.kind] ? d.kind : "signal");
const kindTag = (kind) => { const [label, icon] = KIND[kind] ?? ["", "wait"]; return label ? `<span class="kindtag">${ICON[icon]} ${label}</span>` : ""; };
const prioChip = (p) => (p ? `<span class="prio ${p}" title="Priority: how much it matters now">${p === "monitor" ? "monitor" : `${p} priority`}</span>` : "");
const confDots = (c) => { const n = { high: 3, medium: 2, low: 1 }[c] ?? 1; return `<span class="conf" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`; };
const confLabel = (c) => `<span class="conflabel" title="Confidence: how sure AdMate is about the numbers">${confDots(c)} ${esc(c)} confidence</span>`;
const plat = (p) => (p ? `<span class="plat">${PLATFORM[p] ?? esc(p)}</span>` : "");
function deltaChip(change, mode, confidence, vs) {
  if (change == null) return '<span class="delta flat">no comparison</span>';
  const flat = Math.abs(change) < 0.03, good = higher(mode) ? change > 0 : change < 0;
  const cls = flat || confidence === "low" || mode === "neutral" ? "flat" : good ? "good" : "bad";
  return `<span class="delta ${cls}" title="Change vs ${esc(vs ?? V().compareLabel ?? "")}">${flat ? "→" : change > 0 ? "▲" : "▼"} ${signed(change)}</span>`;
}
function pathHtml(where) {
  const parts = String(where ?? "").split(" › ").filter(Boolean);
  const labels = parts.length === 3 ? ["Campaign", "Ad set", "Ad"] : parts.length === 2 ? ["Campaign", "Ad set"] : ["Campaign"];
  return parts.map((p, i) => `<span class="lvl">${labels[i]}</span> <b>${esc(p)}</b>`).join(' <span aria-hidden="true">›</span> ');
}
const STATUS_TEXT = (dec) => (dec.status === "done" ? "Action taken" : dec.status === "remind" ? `Reminder set for ${fmtDay(dec.until)}` : `Dismissed${dec.reason ? `: ${dec.reason}` : ""}`);
const metricOf = (d) => { const e = d.evidence?.[0]; return e ? `${e.label} ${e.a ? `${e.a} → ` : ""}${e.b}` : ""; };
// Where a statement comes from: the uploaded numbers, AdMate's rule-based reading of them, or a suggestion.
const SRC = {
  data: ["data", "From your data", "Calculated directly from your uploaded reports."],
  read: ["read", "AdMate’s read", "AdMate’s interpretation of the numbers, using fixed, tested rules. A best explanation, not a certainty."],
  step: ["step", "Suggested step", "What AdMate suggests you do. You decide; AdMate never changes your ad account."],
  ai: ["ai", "AI answer", "Written by the AdMate Assistant (Claude) from your AdMate numbers. Check it against the numbers."],
};
const src = (k) => { const [c, label, tip] = SRC[k]; return `<span class="src ${c}" title="${esc(tip)}">${label}</span>`; };
function impactChip(d) {
  const i = d.impact;
  if (!i || !(i.amount > 0)) return "";
  const good = i.label === "saved" || i.label === "extra revenue";
  const bad = i.label === "extra cost" || i.label === "lost revenue";
  return `<span class="impact ${good ? "good" : bad ? "bad" : ""}" title="${i.known ? "Compared with what AdMate expected (its own past, your target or similar items). Looking back only: not a forecast." : "Spend on this item in the period."}"><b>${money(i.amount)}</b> <small>${esc(i.label)}</small></span>`;
}
const legend = () => `<div class="legend"><span><i class="sw high"></i>High</span><span><i class="sw medium"></i>Medium</span><span><i class="sw low"></i>Low priority</span><span>${ICON.problem} Problem</span><span>${ICON.opportunity} Opportunity</span><span>${confDots("high")} Confidence</span></div>`;
const emptyState = (title, text) => `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;
const sectionHead = (title, hint, more) => `<header><h2>${title}</h2>${hint ? `<span class="hint">${hint}</span>` : ""}${more ? `<span class="more">${more}</span>` : ""}</header>`;

// ---------- words ----------
// Ad terms explained on hover (Intermediate); Advanced sees them as-is.
const GLOSS = {
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
const T = (s) => (GLOSS[s] && !isAdv() ? `<abbr class="term" title="${esc(GLOSS[s])}">${esc(s)}</abbr>` : esc(s));
// Beginner: the engine's ad terms in everyday words.
const PLAIN = [
  [/\bCost\/conv\./g, "cost per conversation"], [/\bCost\/follow\b/g, "cost per follow"], [/\bCost\/LPV\b/g, "cost per website visit"], [/\bCost\/reg\./g, "cost per sign-up"], [/\bCost\/1K reach\b/g, "cost per 1,000 people reached"],
  [/\bCPL\b/g, "cost per lead"], [/\bCPA\b/g, "cost per purchase"], [/\bCPC\b/g, "cost per click"], [/\bCPM\b/g, "cost per 1,000 views"], [/\bCPE\b/g, "cost per like or comment"], [/\bCPV\b/g, "cost per video view"], [/\bCPI\b/g, "cost per install"],
  [/\bROAS\b/g, "sales per $1 spent"], [/\bCTR\b/g, "click rate"], [/\bcreatives\b/g, "ad images or videos"], [/\bcreative\b/g, "ad image or video"], [/\bconversion rate\b/gi, "share of clickers who bought or signed up"],
];
const plain = (s) => { const t = PLAIN.reduce((x, [re, w]) => x.replace(re, w), String(s ?? "")); return t.charAt(0).toUpperCase() + t.slice(1); };
// First sentence: ends at ". " + a capital letter (so "Cost/conv. $0.93" or "e.g. reels" don't cut it).
const firstSentence = (s) => { const t = String(s ?? ""); const m = /[.!?](?=\s+[A-Z‘“'"(]|\s*$)/.exec(t); return (m ? t.slice(0, m.index + 1) : t).trim(); };
const singular = (o) => String(o.resultSingular ?? o.resultLabel ?? "result").replace(/s$/, "");
const PRIO_PLAIN = { high: "Do this first", medium: "Worth doing this week", low: "When you have time", monitor: "Just keep an eye on it" };
const CONF_PLAIN = { high: "Very sure: there’s plenty of data behind this.", medium: "Fairly sure, but keep an eye on it.", low: "Not sure yet: there’s little data, so treat this as an early sign." };
const DRV = { cpm: ["Ad cost (CPM)", "showing your ads got {more} expensive"], ctr: ["Click rate (CTR)", "{fewer} people clicked your ads"], cvr: ["Conversion rate", "{fewer} of the people who clicked went on to act"], rate: ["Result rate", "{fewer} of the people who saw the ads took action"], frequency: ["Frequency", "people saw your ads {more} often"], aov: ["Order value", "people spent {more} per order"] };
const drvName = (k, label) => (DRV[k]?.[0] ?? label);
function drvPlain(dr) {
  const up = dr.change > 0;
  return (DRV[dr.key]?.[1] ?? dr.label).replace("{more}", up ? "more" : "less").replace("{fewer}", up ? "more" : "fewer");
}
const mainDriver = (drivers) => (drivers && drivers.length ? [...drivers].sort((x, y) => y.weight - x.weight)[0] : null);

// ---------- charts ----------
function spark(points, target, w = 100, h = 28) {
  const pts = points.filter((p) => p.v != null);
  if (pts.length < 3) return "";
  const vals = pts.map((p) => p.v).concat(target != null ? [target] : []);
  const max = Math.max(...vals) * 1.08, min = Math.min(0, ...vals);
  const x = (i) => (i / (points.length - 1)) * (w - 4) + 2, y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  let d = "";
  points.forEach((p, i) => { if (p.v == null) return; d += (d && points[i - 1]?.v != null ? "L" : "M") + x(i).toFixed(1) + "," + y(p.v).toFixed(1) + " "; });
  const first = points.findIndex((p) => p.v != null), last = points.length - 1 - [...points].reverse().findIndex((p) => p.v != null);
  const area = d + `L${x(last).toFixed(1)},${h - 2} L${x(first).toFixed(1)},${h - 2} Z`;
  const tline = target != null ? `<line x1="2" x2="${w - 2}" y1="${y(target)}" y2="${y(target)}" stroke="var(--muted)" stroke-dasharray="3 3" stroke-width="1"/>` : "";
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${area}" fill="var(--surface-2)"/>${tline}<path d="${d}" fill="none" stroke="var(--fg)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${x(last)}" cy="${y(points[last].v)}" r="2.6" fill="var(--violet)"/></svg>`;
}
// Results per day as bars and the main result (cost per result or ROAS) as a line;
// the selected period shaded and its best day marked.
function dailyChart(series, from, to, opts = {}) {
  const ds = series?.days ?? [];
  if (ds.length < 2) return '<p class="small-note">Not enough daily data for a chart.</p>';
  const W = 640, H = opts.h ?? 200, L0 = 44, R = 54, T0 = 18, B = 26;
  const maxR = Math.max(1, ...ds.map((d) => d.results)) * 1.15;
  const kv = ds.map((d) => d.kpi).filter((v) => v != null && v > 0);
  const maxK = kv.length ? Math.max(...kv) * 1.15 : 1;
  const bw = (W - L0 - R) / ds.length;
  const x = (i) => L0 + i * bw;
  const yR = (v) => H - B - (v / maxR) * (H - T0 - B), yK = (v) => H - B - (v / maxK) * (H - T0 - B);
  const inP = (d) => d.date >= from && d.date <= to;
  const best = ds.reduce((b, d, i) => (inP(d) && d.results > 0 && (b < 0 || d.results > ds[b].results) ? i : b), -1);
  let line = "";
  ds.forEach((d, i) => { if (d.kpi == null || d.kpi <= 0) return; line += (line && ds[i - 1]?.kpi > 0 ? "L" : "M") + (x(i) + bw / 2).toFixed(1) + "," + yK(d.kpi).toFixed(1) + " "; });
  const i0 = ds.findIndex(inP), i1 = ds.length - 1 - [...ds].reverse().findIndex(inP);
  const shade = i0 >= 0 ? `<rect x="${x(i0)}" y="${T0 - 8}" width="${(i1 - i0 + 1) * bw}" height="${H - T0 - B + 8}" fill="var(--violet-soft)"/>` : "";
  const bars = ds.map((d, i) => `<rect x="${(x(i) + bw * 0.18).toFixed(1)}" y="${yR(d.results).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(H - B - yR(d.results)).toFixed(1)}" rx="1.5" fill="${i === best ? "var(--violet)" : inP(d) ? "var(--faint)" : "var(--line)"}"><title>${fmtDay(d.date)}: ${n0(d.results)} ${series.resultLabel}${d.kpi != null ? `, ${series.kpiShort} ${kpi(d.kpi, series.mode)}` : ""}, spend ${money(d.spend)}</title></rect>`).join("");
  const step = Math.max(1, Math.ceil(ds.length / 8));
  const xl = ds.map((d, i) => (i % step === 0 || i === ds.length - 1 ? `<text x="${x(i) + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${fmtDate(d.date)}</text>` : "")).join("");
  const yl = [0, maxR / 2, maxR].map((v) => `<line x1="${L0}" x2="${W - R}" y1="${yR(v)}" y2="${yR(v)}" stroke="var(--line)" stroke-width="0.8"/><text x="${L0 - 6}" y="${yR(v) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${v >= 1000 ? (v / 1000).toFixed(1) + "K" : Math.round(v)}</text>`).join("");
  const kl = [maxK / 2, maxK].map((v) => `<text x="${W - R + 6}" y="${yK(v) + 3}" font-size="9.5" fill="var(--fg)">${kpi(v, series.mode)}</text>`).join("");
  const bestMark = best >= 0 ? `<text x="${x(best) + bw / 2}" y="${yR(ds[best].results) - 5}" text-anchor="middle" font-size="10" font-weight="500" fill="var(--violet)">best</text>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.resultLabel)} per day and ${esc(series.kpiLabel)}">${shade}${yl}${bars}${bestMark}<path d="${line}" fill="none" stroke="var(--fg)" stroke-width="1.8" stroke-linejoin="round"/>${kl}${xl}</svg>
    <div class="legend"><span><i class="sw" style="background:var(--faint)"></i>${esc(series.resultLabel)} per day</span><span><i class="sw" style="background:var(--violet)"></i>best day</span><span><svg width="18" height="8" aria-hidden="true"><line x1="0" x2="18" y1="4" y2="4" stroke="var(--fg)" stroke-width="2"/></svg>${T(series.kpiShort)} (right axis)</span><span><i class="sw" style="background:var(--violet-soft)"></i>selected period</span></div>`;
}
// Beginner: one series only (results per day), no second axis.
function simpleBars(series, from, to, h = 150) {
  const ds = series?.days ?? [];
  if (ds.length < 2) return '<p class="small-note">Not enough daily data for a chart yet.</p>';
  const W = 640, L0 = 34, R = 8, T0 = 16, B = 24;
  const max = Math.max(1, ...ds.map((d) => d.results)) * 1.18;
  const bw = (W - L0 - R) / ds.length;
  const x = (i) => L0 + i * bw, y = (v) => h - B - (v / max) * (h - T0 - B);
  const inP = (d) => d.date >= from && d.date <= to;
  const best = ds.reduce((b, d, i) => (inP(d) && d.results > 0 && (b < 0 || d.results > ds[b].results) ? i : b), -1);
  const step = Math.max(1, Math.ceil(ds.length / 7));
  return `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(series.resultLabel)} per day">
    <line x1="${L0}" x2="${W - R}" y1="${h - B}" y2="${h - B}" stroke="var(--line)"/>
    <text x="${L0 - 6}" y="${y(max / 1.18) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${Math.round(max / 1.18)}</text>
    ${ds.map((d, i) => `<rect x="${(x(i) + bw * 0.15).toFixed(1)}" y="${y(d.results).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${(h - B - y(d.results)).toFixed(1)}" rx="2" fill="${i === best ? "var(--violet)" : inP(d) ? "color-mix(in srgb, var(--violet) 45%, var(--bg))" : "var(--line)"}"><title>${fmtDay(d.date)}: ${n0(d.results)} ${esc(series.resultLabel)}</title></rect>`).join("")}
    ${best >= 0 ? `<text x="${x(best) + bw / 2}" y="${y(ds[best].results) - 5}" text-anchor="middle" font-size="10" font-weight="500" fill="var(--violet)">best</text>` : ""}
    ${ds.map((d, i) => (i % step === 0 || i === ds.length - 1 ? `<text x="${x(i) + bw / 2}" y="${h - 7}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${fmtDate(d.date)}</text>` : "")).join("")}
  </svg><div class="legend"><span><i class="sw" style="background:color-mix(in srgb, var(--violet) 45%, var(--bg))"></i>this period</span><span><i class="sw" style="background:var(--line)"></i>before</span><span><i class="sw" style="background:var(--violet)"></i>best day</span></div>`;
}
function dailyFacts(series, from, to) {
  const inP = (series?.days ?? []).filter((d) => d.date >= from && d.date <= to);
  if (!inP.length) return "";
  const best = inP.reduce((b, d) => (d.results > b.results ? d : b));
  const withRes = inP.filter((d) => d.kpi != null && d.kpi > 0);
  const cheapest = withRes.length ? withRes.reduce((b, d) => ((higher(series.mode) ? d.kpi > b.kpi : d.kpi < b.kpi) ? d : b)) : null;
  const byWd = Array.from({ length: 7 }, () => ({ r: 0, n: 0 }));
  for (const d of series.days) { byWd[d.weekday].r += d.results; byWd[d.weekday].n++; }
  const bestWd = byWd.map((x, i) => ({ i, avg: x.n ? x.r / x.n : 0 })).sort((p, q) => q.avg - p.avg)[0];
  const total = inP.reduce((s, d) => s + d.results, 0);
  return `<div class="facts">
    <div>Best day<b>${fmtDay(best.date)}</b>${n0(best.results)} ${esc(series.resultLabel)}</div>
    ${cheapest ? `<div>${higher(series.mode) ? "Highest" : "Cheapest"} ${T(series.kpiShort)}<b>${fmtDay(cheapest.date)}</b>${kpi(cheapest.kpi, series.mode)}</div>` : ""}
    <div>Best weekday (avg, 4 weeks)<b>${WEEKDAYS[bestWd.i]}</b>${bestWd.avg.toFixed(1)} ${esc(series.resultLabel)} a day</div>
    <div>Total in period<b>${n0(total)}</b>${esc(series.resultLabel)} over ${plural(inP.length, "day")}</div>
  </div>`;
}
function bullet(o, g, compared = true) {
  const vals = [o.value, g.target, g.breakEven, compared ? o.previous : null].filter((v) => v != null);
  if (o.value == null || !vals.length) return "";
  const max = Math.max(...vals) * 1.18, W = 400, H = 26, X = (v) => (v / max) * W;
  const [cls] = STATE[g.state] ?? ["flat"];
  const fill = cls === "bad" ? "var(--hi)" : cls === "warn" ? "var(--mid)" : cls === "good" ? "var(--good)" : "var(--muted)";
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(o.kpiShort)} ${esc(kpi(o.value, o.mode))}"><rect x="0" y="9" width="${W}" height="8" rx="4" fill="var(--surface-2)"/><rect x="0" y="9" width="${X(o.value)}" height="8" rx="4" fill="${fill}"/>`;
  if (compared && o.previous != null) s += `<rect x="${X(o.previous) - 1}" y="11" width="2" height="4" fill="var(--faint)"/>`;
  if (g.breakEven != null) s += `<line x1="${X(g.breakEven)}" x2="${X(g.breakEven)}" y1="3" y2="23" stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="2 2"/>`;
  if (g.target != null) s += `<rect x="${X(g.target) - 1.5}" y="2" width="3" height="22" fill="var(--fg)"/>`;
  return s + "</svg>";
}
// "Why it changed": each driver's share of the change in the main result.
function driverBars(drivers) {
  if (!drivers?.length) return "";
  return `<div class="drv">${[...drivers].sort((x, y) => y.weight - x.weight).map((d) => `<div class="drvrow"><span>${T(drvName(d.key, d.label))}</span><span class="bar" title="${Math.round(d.weight * 100)}% of the movement"><i class="${d.helped ? "help" : "hurt"}" style="width:${Math.max(3, d.weight * 100)}%"></i></span><span class="ch num ${d.helped ? "delta good" : "delta bad"}">${d.change > 0 ? "▲" : "▼"} ${signed(d.change)}</span></div>`).join("")}
    <div class="legend"><span><i class="sw" style="background:var(--hi)"></i>pushed the result the wrong way</span><span><i class="sw" style="background:var(--good)"></i>helped</span><span>Bar length = share of the change it explains</span></div></div>`;
}
const driverChip = (drivers) => { const m = mainDriver(drivers); return m && Math.abs(m.change) >= 0.03 ? `<span class="drvchip ${m.helped ? "help" : "hurt"}" title="Main driver of the change">${esc(drvName(m.key, m.label).replace(/ \(.*\)$/, ""))} ${signed(m.change)}</span>` : ""; };
function driverSentence(drivers, mode) {
  const m = mainDriver(drivers);
  if (!m || Math.abs(m.change) < 0.03) return "";
  return `Mainly because ${drvPlain(m)} (${esc(drvName(m.key, m.label))} ${signed(m.change)}), which explains about ${Math.round(m.weight * 100)}% of the change.`;
}

// ---------- overlay helpers ----------
function toast(t) { $("#toastRoot").innerHTML = `<div class="toast" role="status">${esc(t)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => ($("#toastRoot").innerHTML = ""), 3400); }
function closeOverlay() { $("#overlay").innerHTML = ""; current = null; }

// ---------- the item panel: Beginner (plain), Intermediate (investigate), Advanced (+ statistics) ----------
function openDrawer(d, opts = {}) {
  if (!d) return;
  current = d;
  const depth = opts.depth ?? L();
  const v = V();
  const ent = opts.entity ?? d.entity;
  const r = rowOf(ent, v);
  const series = ent ? E.daily(ent.level, ent.id, v.from, v.to, acct) : null;
  const body = depth === "beginner" ? drawerBeginner(d, r, series, v) : drawerInvestigate(d, r, series, v, depth === "advanced");
  $("#overlay").innerHTML = `<div class="scrim" data-close></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t">
    <header>
      <button class="x" type="button" data-close>Close ✕</button>
      ${body.head}
      <div><button class="btn small" type="button" data-askabout="${esc(d.key)}">Ask the Assistant about this</button>${opts.depth && opts.depth !== L() ? ` <span class="small-note">Showing the ${XP[opts.depth].name} view of this item.</span>` : ""}</div>
    </header>
    <div class="scroll">${body.main}</div>
    <footer id="drawerFoot">${footer(decided[d.key], "", depth)}</footer>
  </aside>`;
  $(".drawer .x").focus();
}
const recheckOf = (d) => (d.whatToDo ?? []).find((s) => /^Re-check/.test(s));
const stepsOf = (d) => (d.whatToDo ?? []).filter((s) => !/^Re-check/.test(s));
const prReasonOf = (d) => String(d.priorityReason ?? "").replace(/^(High|Medium|Low)( instead of high)?: /, "");

function drawerBeginner(d, r, series, v) {
  const camp = String(d.where ?? "").split(" › ")[0];
  const tone = d.bucket === "problem" ? (d.priority === "high" ? "bad" : "warn") : d.bucket === "opportunity" ? "good" : "flat";
  const i = d.impact;
  const money1 = i && i.known && i.amount > 0 ? (i.label === "saved" ? `This saved you about <b>${money(i.amount)}</b> compared with what AdMate expected.` : i.label === "extra revenue" ? `This brought about <b>${money(i.amount)}</b> more in sales than expected.` : `This cost you about <b>${money(i.amount)}</b> ${i.label === "lost revenue" ? "in lost sales" : "extra"} in ${esc(v.label)}.`) : "";
  const steps = stepsOf(d);
  const rc = recheckOf(d);
  const ev = (d.evidence ?? []).slice(0, 4);
  const head = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="tag ${tone}">${esc(PRIO_PLAIN[d.priority] ?? "")}</span>${plat(d.platform)}</div>
    <h3 id="dr-t">${esc(plain(d.title))}</h3>${camp ? `<div class="crumbs">In <b>${esc(camp)}</b></div>` : ""}`;
  const main = `
    <div class="blk"><h4>What’s happening</h4><p>${esc(plain(d.description))}</p></div>
    ${money1 ? `<div class="blk"><h4>Why it matters</h4><p>${money1}</p></div>` : ""}
    ${steps.length ? `<div class="blk"><h4>What to do</h4><ol>${steps.map((s) => `<li>${esc(plain(s))}</li>`).join("")}</ol>${rc ? `<p class="small-note">${esc(plain(rc))}</p>` : ""}</div>` : ""}
    ${series ? `<div class="blk"><h4>How it’s going, day by day</h4>${simpleBars(series, v.from, v.to)}</div>` : ""}
    <details class="more"><summary>More detail, still in plain words</summary><div>
      ${ev.length ? `<div class="blk"><h4>The numbers behind this</h4><ul>${ev.map((e) => `<li>${esc(plain(e.label))}: ${e.a ? `${esc(e.a)} before → ` : ""}<b>${esc(e.b)}</b>${e.a ? " now" : ""}</li>`).join("")}</ul></div>` : ""}
      ${d.whyHappening?.[0] ? `<div class="blk"><h4>Likely reason</h4><span class="hyp">A best guess from the numbers, not a confirmed cause.</span><p>${esc(plain(d.whyHappening[0]))}</p></div>` : ""}
      <div class="blk"><h4>How sure is AdMate?</h4><p>${esc(CONF_PLAIN[d.confidence] ?? "")}</p></div>
      <p><button class="link" type="button" data-deeper="${esc(d.key)}">See the full analysis (Intermediate view) →</button></p>
    </div></details>`;
  return { head, main };
}

function drawerInvestigate(d, r, series, v, adv) {
  const steps = stepsOf(d);
  const rc = recheckOf(d);
  const cause = d.whyHappening?.[0], rest = (d.whyHappening ?? []).slice(1);
  const prReason = prReasonOf(d);
  const kind = kindOf(d);
  const head = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${prioChip(d.priority)}${kindTag(kind)}${plat(d.platform)}${impactChip(d)}</div>
    <h3 id="dr-t">${esc(d.title)}</h3>${d.where ? `<div class="crumbs">${pathHtml(d.where)}</div>` : ""}`;
  // 1. What changed
  const big = r && r.kpi != null
    ? `<div class="bigchange"><span class="v">${kpi(r.kpi, r.mode)}</span><span class="muted">${T(r.kpiShort)} in ${esc(v.label)}</span>${r.kpiA != null ? `<span class="muted">was ${kpi(r.kpiA, r.mode)}${v.compareLabel ? ` in ${esc(v.compareLabel)}` : ""}</span>${deltaChip(r.change, r.mode, r.confidence)}` : `<span class="small-note">${v.compareLabel ? "No data in the comparison period." : "No comparison period selected."}</span>`}</div>`
    : "";
  const evTable = (d.evidence ?? []).length ? `<div class="evwrap"><table class="ev"><thead><tr><th>Metric</th><th>${v.compareLabel ? esc(v.compareLabel) : "Before"}</th><th>${esc(v.label)}</th></tr></thead><tbody>${d.evidence.map((e) => `<tr><td>${T(e.label)}</td><td class="num">${esc(e.a ?? "—")}</td><td class="num">${esc(e.b)}</td></tr>`).join("")}</tbody></table></div>` : "";
  // 2. Why
  const drv = r?.drivers;
  const whyBlock = drv?.length || cause
    ? `<div class="blk"><h4><span class="stepno">2</span> Why ${src("read")}</h4>${drv?.length ? `${driverBars(drv)}<p>${driverSentence(drv, r.mode)}</p>` : ""}${cause ? `<p><span class="hyp">Likely cause (a hypothesis):</span> ${esc(cause)}</p>` : ""}${rest.length ? `<details class="small"><summary>More context (${rest.length})</summary><ul>${rest.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}</div>`
    : "";
  // 3. Where: the ad sets / ads behind it, or the ad's siblings in its ad set.
  const where = r ? whereTable(r, v) : "";
  const stats = adv && r ? advStats(r, d, v) : "";
  const main = `
    <div class="rank">
      <div><b>Priority ${prioChip(d.priority)}</b><span>How much it matters now. ${esc(prReason)}</span></div>
      <div><b>Confidence ${confDots(d.confidence)} ${esc(d.confidence)}</b><span>How sure AdMate is. ${esc(String(d.confidenceText ?? "").replace(/^\w+ — /, ""))}</span></div>
    </div>
    <div class="blk"><h4><span class="stepno">1</span> What changed ${src("data")}</h4>${big}<p>${esc(d.description)}</p>${evTable}</div>
    ${whyBlock}
    ${where ? `<div class="blk"><h4><span class="stepno">3</span> Where ${src("data")}</h4>${where}</div>` : ""}
    ${series ? `<div class="blk"><h4><span class="stepno">${where ? 4 : 3}</span> Day by day ${src("data")}</h4>${dailyChart(series, v.from, v.to)}${dailyFacts(series, v.from, v.to)}</div>` : ""}
    ${d.cost ? `<div class="blk"><h4>What it cost ${src("data")}</h4><div class="costbox"><p>${esc(d.cost)}</p><span class="small-note">Looking back only: money the change already cost, not a forecast.</span></div></div>` : ""}
    <div class="blk"><h4>What to do ${src("step")}</h4><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${d.risk ? `<p class="small-note"><b>Risk:</b> ${esc(d.risk)}</p>` : ""}${rc ? `<p class="small-note">${esc(rc)}</p>` : ""}</div>
    ${(d.cantTell ?? []).length ? `<div class="warnbox"><b>What this report can’t tell us.</b> ${d.cantTell.map(esc).join(" ")}</div>` : ""}
    ${stats}
    <details class="small" ${adv ? "open" : ""}><summary>How AdMate judged this</summary><ul>${(d.judgedBy ?? []).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>`;
  return { head, main };
}
function whereTable(r, v) {
  let rows = [], title = "", vsSiblings = false;
  if (r.level === "campaign") { rows = v.levels.ad_group.filter((x) => x.campaignId === r.id); title = "Its ad sets"; }
  else if (r.level === "ad_group") { rows = v.levels.ad.filter((x) => x.adSetId === r.id); title = "Its ads"; vsSiblings = true; }
  else { rows = v.levels.ad.filter((x) => x.adSetId === r.adSetId); title = "This ad and the other ads in its ad set"; vsSiblings = true; }
  if (rows.length < 2 && r.level !== "campaign") return "";
  if (!rows.length) return "";
  const vals = rows.map((x) => x.kpi).filter((k) => k != null);
  const bestK = vals.length ? (higher(r.mode) ? Math.max(...vals) : Math.min(...vals)) : null;
  const worstK = vals.length ? (higher(r.mode) ? Math.min(...vals) : Math.max(...vals)) : null;
  const ads = r.level === "campaign" ? v.levels.ad.filter((x) => x.campaignId === r.id).sort((a, b) => b.spend - a.spend).slice(0, 6) : [];
  const tbl = (list, label) => `<div class="tablewrap"><table class="tbl dense"><thead><tr><th>${label}</th><th class="r">Spend</th><th class="r">${T(r.kpiShort)}</th><th class="r">Change</th><th class="r">${T("CTR")}</th><th>Next step</th></tr></thead><tbody>${list.map((x) => `<tr class="click${x.id === r.id ? " sel" : ""}" data-entity="${x.level}:${esc(x.id)}"><td><div class="nm">${esc(x.name)}</div></td><td class="r num">${money(x.spend)}</td><td class="r num ${x.kpi != null && x.kpi === bestK && list.length > 1 ? "best" : x.kpi != null && x.kpi === worstK && list.length > 1 ? "worst" : ""}">${kpi(x.kpi, x.mode)}</td><td class="r">${deltaChip(x.change, x.mode, x.confidence)}</td><td class="r num">${pct(x.ctr, 2)}</td><td>${esc(x.label ?? "")}</td></tr>`).join("")}</tbody></table></div>`;
  return `<p class="small-note">${esc(title)}${vsSiblings ? ": ads in the same ad set share its audience and budget, so they’re a fair comparison." : "."} Green = best, red = weakest. Click a row to open it.</p>${tbl(rows, LEVEL[rows[0].level])}${ads.length ? `<p class="small-note">Its biggest ads:</p>${tbl(ads, "Ad")}` : ""}`;
}
function advStats(r, d, v) {
  const cells = [["Spend", money(r.spend)], ["Share of spend", pct(r.share, 1)], ["Impressions", n0(r.impressions)], ["Reach", n0(r.reach)], ["Frequency", n1(r.frequency)], ["Clicks", n0(r.clicks)], ["CTR", pct(r.ctr, 2)], ["CPC", money(r.cpc)], ["CPM", money(r.cpm)], [r.resultLabel, n0(r.results)], ["Conversion rate", pct(r.cvr, 1)], [r.kpiShort, kpi(r.kpi, r.mode)]];
  return `<div class="blk"><h4>Statistics ${src("data")}</h4>
    <div class="facts">${cells.map(([k, val]) => `<div>${esc(k)}<b>${val}</b></div>`).join("")}</div>
    <p class="small-note"><b>Compared with:</b> ${esc(r.yardstick ?? "nothing yet")}${v.history ? ` · older history checked: ${esc(v.history)}` : ""}${v.perDay ? " · volumes per day (periods of different length)" : ""}.</p></div>`;
}

function footer(dec, mode = "", depth = L()) {
  if (dec) return `<span class="note small-note">${esc(STATUS_TEXT(dec))}.</span><button class="btn" type="button" data-act="restore">${dec.status === "remind" ? "Cancel reminder" : "Undo"}</button>`;
  if (depth === "beginner") return `<span class="note small-note">AdMate never changes your ads. You make the change, then tell AdMate.</span><button class="btn" type="button" data-act="remind" data-days="1">Remind me tomorrow</button><button class="btn" type="button" data-act="dismissed" data-reason="Not relevant">Not for me</button><button class="btn primary" type="button" data-act="done">I did this</button>`;
  if (mode === "dismiss") return `<span class="note small-note">Why? It helps AdMate get better.</span>${["Not relevant", "Already handled", "Wrong"].map((r) => `<button class="btn small" type="button" data-act="dismissed" data-reason="${r}">${r}</button>`).join("")}<button class="btn small" type="button" data-act="cancel">Cancel</button>`;
  const menu = mode === "remind" ? `<div class="menu" role="menu">${[[1, "Tomorrow"], [3, "In 3 days"], [7, "In a week"]].map(([n, l]) => `<button type="button" role="menuitem" data-act="remind" data-days="${n}">${l}<small>${fmtDay(addDays(END, n))}</small></button>`).join("")}</div>` : "";
  return `${menu}<span class="note small-note">AdMate never changes your ad account.</span>
    <button class="btn" type="button" data-act="remindmenu" aria-expanded="${mode === "remind"}">Remind me later ▾</button><button class="btn" type="button" data-act="dismiss">Dismiss</button><button class="btn primary" type="button" data-act="done">Action taken</button>`;
}
function decideKey(key, kind, extra, quiet) {
  if (kind === "restore") { delete decided[key]; if (!quiet) toast("Back on the list"); return; }
  if (kind === "remind") {
    const until = addDays(END, Number(extra ?? 1));
    decided[key] = { status: "remind", until };
    if (!quiet) toast(`We’ll remind you on ${fmtDay(until)}`);
  } else {
    decided[key] = { status: kind, reason: extra };
    if (!quiet) toast(kind === "done" ? "Noted. AdMate checks whether it worked after your next upload." : "Dismissed");
  }
}
function act(kind, extra) {
  const d = current;
  if (!d) return;
  if (kind === "dismiss") return ($("#drawerFoot").innerHTML = footer(null, "dismiss"));
  if (kind === "remindmenu") return ($("#drawerFoot").innerHTML = footer(null, $(".menu") ? "" : "remind"));
  if (kind === "cancel") return ($("#drawerFoot").innerHTML = footer(null));
  decideKey(d.key, kind, extra);
  closeOverlay();
  render();
}

// ---------- welcome question + view + account switchers ----------
function openOnboard(compare = false) {
  $("#overlay").innerHTML = `<div class="scrim" ${xp ? "data-close" : ""}></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ob-t"><div class="onboard">
    <div><span class="label">${compare ? "The three views" : "Welcome to AdMate"}</span><h2 id="ob-t" style="margin-top:6px">${compare ? "Same numbers, three ways to use them" : "Which view suits you?"}</h2></div>
    <p>AdMate reads your ad reports and tells you how your ads are doing, what’s wrong and what to do next. Every view uses the same numbers; they differ in how much they show and what they help you do.</p>
    <div class="lvlcards">${Object.entries(XP).map(([k, x]) => `<button class="lvlcard" type="button" data-xp-pick="${k}" aria-pressed="${k === xp}"><span class="job">${x.job}</span><b>${x.name}</b><span class="who">${esc(x.who)}</span><ul>${x.see.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><span class="small-note" style="font-family:var(--font-mono);font-size:11.5px">${esc(x.example)}</span><span class="btn ${k === xp ? "" : "primary"} small pick">${k === xp ? "Your current view" : `Use ${x.name}`}</span></button>`).join("")}</div>
    <p class="small-note">${compare ? "" : "Not sure? Start with Beginner. "}You can switch any time from “Your view” in the sidebar.${compare ? ' <button class="link" type="button" data-close>Close</button>' : ""}</p>
  </div></div>`;
  $(".lvlcard")?.focus();
}
let openPop = null; // "acct" | "view" | null
function renderSwitchers() {
  const a = ACCTS.find((x) => x.id === acct);
  $("#acctsw").innerHTML = `<button class="pickbtn" type="button" data-pop="acct" aria-expanded="${openPop === "acct"}" aria-haspopup="true"><span class="label">Ad account</span><b>${esc(a.name)}</b><small>${esc([a.industry, a.country].filter(Boolean).join(" · "))}</small><span class="chev" aria-hidden="true">▾</span></button>
    ${openPop === "acct" ? `<div class="pop" role="menu">${isAdv() ? `<button type="button" role="menuitem" data-go="portfolio"><b>All accounts</b><small>Portfolio overview</small></button><hr>` : ""}${ACCTS.map((x) => `<button type="button" role="menuitemradio" aria-checked="${x.id === acct}" data-acct="${x.id}"><b>${esc(x.name)}${x.id === acct ? " ✓" : ""}</b><small>${esc([x.industry, x.country].filter(Boolean).join(" · "))}</small></button>`).join("")}<hr><button type="button" role="menuitem" data-go="addaccount"><b>+ Add an ad account</b></button></div>` : ""}`;
  const x = XP[L()];
  $("#viewsw").innerHTML = `<button class="pickbtn viewbtn" type="button" data-pop="view" aria-expanded="${openPop === "view"}" aria-haspopup="true"><span class="label">Your view</span><b>${x.name}</b><small>${x.job}</small><span class="chev" aria-hidden="true">▾</span></button>
    ${openPop === "view" ? `<div class="pop" role="menu">${Object.entries(XP).map(([k, y]) => `<button type="button" role="menuitemradio" aria-checked="${k === L()}" data-xp-set="${k}"><b>${y.name} · ${y.job}${k === L() ? " ✓" : ""}</b><small>${esc(y.who)}</small></button>`).join("")}<hr><button type="button" role="menuitem" data-compare-views><b>Compare the three views</b></button></div>` : ""}`;
}
function setAccount(id) {
  acct = id;
  LS.set("admate-acct", id);
  ui.expanded.clear(); ui.compare.clear(); ui.actSel.clear(); ui.trendObj = null; ui.budgetObj = null; ui.aud.target = null;
  openPop = null;
}

// ---------- header: account + page title, period control, context line ----------
// The same date picker in every view (days, weeks, months or a calendar; compared
// with the period before, another period, or nothing). Beginner gets plainer words.
function renderHead(title, withPeriod) {
  const v = V();
  $("#eyebrow").textContent = view === "portfolio" ? `${ACCTS.length} sample accounts` : acctName();
  $("#title").textContent = title;
  const sum = `<button class="btn" type="button" data-summary>${isBeg() ? "Share a summary" : "Summary report"}</button>`;
  if (!withPeriod) { $("#meta").innerHTML = ""; $("#ctx").innerHTML = ""; return; }
  $("#meta").innerHTML = `<button class="periodbtn" type="button" id="periodBtn" aria-expanded="false" aria-haspopup="dialog"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><b>${esc(sel.a.name && sel.a.name !== range(sel.a.from, sel.a.to) ? sel.a.name : v.label)}</b><span>${v.compareLabel ? `vs ${esc(v.compareLabel)}` : "no comparison"}</span><span aria-hidden="true">▾</span></button>${view === "portfolio" ? "" : sum}<div id="pickerRoot"></div>`;
  if (isBeg()) {
    $("#ctx").innerHTML = v.compareLabel
      ? `<span>Showing <b>${esc(v.label)}</b>, compared with <b>${esc(v.compareLabel)}</b>${sel.cmp === "pick" ? "" : ` (the ${plural(v.days, "day")} before)`}.</span>`
      : `<span>Showing <b>${esc(v.label)}</b> on its own, with no comparison.</span>`;
    return;
  }
  const how = sel.cmp === "pick" ? "the period you chose" : days(v.from, v.to) === 1 ? "the day before" : "the same number of days right before";
  const explain = v.compareLabel
    ? `Every ▲▼ compares ${v.label} with ${v.compareLabel} (${how})${v.perDay ? ", per day because the periods have different lengths" : ""}.${v.history ? ` Before suggesting “put more money in” or “cut”, AdMate also checks the change against the older history (${v.history}).` : ""}${v.days === 1 ? " One day is for exploring only: no budget calls on a single day." : ""}`
    : `No comparison: campaigns are judged against their own results before this period${v.history ? ` (${v.history})` : ""}, then your targets.`;
  $("#ctx").innerHTML = `<span><b>${esc(v.label)}</b> ${v.compareLabel ? `vs <b>${esc(v.compareLabel)}</b>` : "· no comparison"}${isAdv() && v.history ? ` · history ${esc(v.history)}` : ""}</span><button class="info" type="button" data-explain="${esc(explain)}" aria-label="How periods are compared" title="${esc(explain)}">i</button>`;
}
function renderBanner() {
  $("#banner").innerHTML = view === "portfolio"
    ? `<span><b>Sample accounts.</b> All ${ACCTS.length} businesses are made up, so you can explore safely.</span>`
    : `<span><b>Sample account.</b> ${esc(acctName())} is made up, so you can explore safely.</span><button class="link" type="button" data-go="upload">Upload your own report →</button>`;
}

// ---------- period picker: the same in every view ----------
let pk = null;
function openPicker() {
  pk = { aKind: guessKind(sel.a), a: { ...sel.a }, cmp: sel.cmp, bKind: sel.b ? guessKind(sel.b) : guessKind(sel.a), b: sel.b ? { ...sel.b } : null, cal: {} };
  $("#periodBtn")?.setAttribute("aria-expanded", "true");
  drawPicker();
}
// A preset (Last 7 days, a week, a month) keeps its tab; anything else opens the calendar.
function guessKind(p) {
  for (const k of ["day", "week", "month"]) if (choices(k).some((c) => c.from === p.from && c.to === p.to)) return k;
  return "custom";
}
function chooser(which) {
  const kind = which === "a" ? pk.aKind : pk.bKind, cur = pk[which];
  const list = kind === "custom" ? [] : choices(kind);
  const tabs = ["day", "week", "month", "custom"].map((k) => `<button type="button" data-pkkind="${which}:${k}" aria-pressed="${k === kind}">${{ day: "Day", week: "Week", month: "Month", custom: "Calendar" }[k]}</button>`).join("");
  const body = kind === "custom"
    ? calendarHtml(which)
    : `<div class="choices">${list.map((c, i) => `<button type="button" data-pkpick="${which}:${i}" aria-pressed="${cur && cur.from === c.from && cur.to === c.to}">${esc(c.name)}${c.small ? `<small>${esc(c.small)}</small>` : ""}</button>`).join("")}</div>`;
  return `<div class="seg" role="group" aria-label="Period type">${tabs}</div>${body}`;
}
// Calendar: two months side by side; click the first day, then the last day.
const monthOf = (d) => d.slice(0, 7);
const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7); };
function calendarHtml(which) {
  const cur = pk[which];
  const c = (pk.cal[which] ??= { month: monthOf(cur?.to && cur.to <= END ? cur.to : END), anchor: null });
  const min = MIN(), max = END;
  const shown = c.anchor ? { from: c.anchor, to: c.anchor } : cur;
  const month = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let cells = "";
    for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) cells += "<span></span>";
    for (let dd = 1; dd <= n; dd++) {
      const ds = `${ym}-${String(dd).padStart(2, "0")}`;
      const inR = shown && ds >= shown.from && ds <= shown.to;
      const edge = shown && (ds === shown.from || ds === shown.to);
      cells += `<button type="button" class="cd${inR ? " in" : ""}${edge ? " edge" : ""}${ds === max ? " today" : ""}" data-calday="${which}:${ds}" aria-label="${fmtDay(ds)}${ds === max ? " (latest data)" : ""}" aria-pressed="${!!edge}" ${ds < min || ds > max ? "disabled" : ""}>${dd}</button>`;
    }
    return `<div class="cal-m"><b>${first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b><div class="cal-g">${["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x) => `<span>${x}</span>`).join("")}${cells}</div></div>`;
  };
  const left = shiftMonth(c.month, -1);
  return `<div class="cal">
    <div class="cal-nav"><button type="button" data-calnav="${which}:-1" aria-label="Earlier months" ${left <= monthOf(min) ? "disabled" : ""}>‹</button><span>${c.anchor ? "Now click the last day" : "Click the first day, then the last day"}</span><button type="button" data-calnav="${which}:1" aria-label="Later months" ${c.month >= monthOf(max) ? "disabled" : ""}>›</button></div>
    <div class="cal-ms">${month(left)}${month(c.month)}</div>
    <p class="cal-sum">${cur && !c.anchor ? `Selected: <b>${range(cur.from, cur.to)}</b> · ${plural(days(cur.from, cur.to), "day")}` : c.anchor ? `Starts <b>${fmtDay(c.anchor)}</b>…` : "Nothing selected yet."} <span class="small-note">Data from ${fmtDate(min)} to ${fmtDate(max)}.</span></p>
  </div>`;
}
function calClick(which, ds) {
  const c = pk.cal[which];
  if (!c.anchor) { c.anchor = ds; pk[which] = { from: ds, to: ds, name: fmtDay(ds) }; }
  else {
    const from = ds < c.anchor ? ds : c.anchor, to = ds < c.anchor ? c.anchor : ds;
    pk[which] = { from, to, name: range(from, to) };
    c.anchor = null;
  }
  drawPicker();
}
function drawPicker() {
  const prev = prevOf(pk.a);
  $("#pickerRoot").innerHTML = `<div class="picker" role="dialog" aria-label="Choose periods">
    <div class="pk"><h4>1. Show</h4>${chooser("a")}</div>
    <div class="pk"><h4>2. Compare with</h4>
      <div class="radios">
        <label><input type="radio" name="pkcmp" value="previous" ${pk.cmp === "previous" ? "checked" : ""}><span>The period right before<small>${range(prev.from, prev.to)}${prev.from < MIN() ? " · partly before your first upload" : ""}</small></span></label>
        <label><input type="radio" name="pkcmp" value="pick" ${pk.cmp === "pick" ? "checked" : ""}><span>Another period I choose<small>e.g. this Tuesday vs last Tuesday, or October vs August</small></span></label>
        <label><input type="radio" name="pkcmp" value="none" ${pk.cmp === "none" ? "checked" : ""}><span>Don’t compare<small>Judged against each campaign’s own past and your targets</small></span></label>
      </div>
      ${pk.cmp === "pick" ? chooser("b") : ""}
    </div>
    <div class="pickfoot"><span>Data from ${fmtDate(MIN())} to ${fmtDate(END)}</span><button class="btn" type="button" data-pkcancel>Cancel</button><button class="btn primary" type="button" data-pkapply>Apply</button></div>
  </div>`;
}
function readCustom(which) {
  const f = $(`#pk-${which}-from`)?.value, t = $(`#pk-${which}-to`)?.value;
  if (f && t && f <= t) pk[which] = { from: f, to: t, name: range(f, t) };
}
function closePicker() { if ($("#pickerRoot")) $("#pickerRoot").innerHTML = ""; $("#periodBtn")?.setAttribute("aria-expanded", "false"); pk = null; }

// ---------- summary report (all views) ----------
function openSummary() {
  const v = V(), f = v.summaryFacts;
  const main = byGoalSpend(v)[0];
  const tot = main ? main.daily.map((d) => ({ date: d.date, weekday: D0(d.date).getUTCDay(), spend: d.spend, results: d.results, kpi: d.v })) : [];
  const great = v.great[0];
  $("#overlay").innerHTML = `<div class="scrim" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="rp-t"><article class="mbox">
    <header><div><span class="label">Summary report</span><h2 id="rp-t">${esc(f.title)}</h2></div><div style="display:flex;gap:8px"><button class="btn" type="button" data-copysummary>Copy as text</button><button class="btn" type="button" data-close>Close</button></div></header>
    <div class="mbody">
      <p style="font-size:16px;max-width:70ch">${esc(f.headline)}</p>
      <div class="rtiles">
        <div class="tile"><span class="k">Spend</span><span class="v">${money(v.spend)}</span>${deltaChip(v.spendChange, "neutral")}</div>
        ${byGoalSpend(v).slice(0, 3).map((o) => `<div class="tile"><span class="k">${esc(o.label)} · ${T(o.kpiShort)}</span><span class="v">${kpi(o.value, o.mode)}</span>${deltaChip(o.change, o.mode, o.confidence)}</div>`).join("")}
      </div>
      ${main ? `<section class="section"><h3>${esc(main.label)}: the last ${tot.length} days</h3><div class="chartbox">${dailyChart({ mode: main.mode, kpiShort: main.kpiShort, kpiLabel: main.kpiLabel, resultLabel: main.resultLabel, days: tot }, v.from, v.to, { h: 190 })}</div></section>` : ""}
      <section class="section"><h3>What changed</h3><ul>${(f.changes.length ? f.changes : ["No comparable earlier period yet."]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <section class="section"><h3>What’s working</h3><ul><li>${esc(f.working ?? "Nothing stands out as a clear winner this period.")}</li>${great ? `<li>Consider more budget for <b>${esc(great.campaign)}</b> (${esc(great.kpi)}).</li>` : ""}</ul></section>
      <section class="section"><h3>What I’m doing about it</h3><ul>${(f.doing.length ? f.doing : ["Nothing needs changing right now; keep monitoring."]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      ${f.next.length ? `<section class="section"><h3>Next</h3><ul>${f.next.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
      ${f.caveats.length ? `<section class="section"><h3>Caveats</h3><ul>${f.caveats.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
      <p class="small-note">Written from your numbers for ${esc(v.label)}${v.compareLabel ? ` vs ${esc(v.compareLabel)}` : ""}.</p>
    </div></article></div>`;
}
