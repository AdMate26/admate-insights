// Advanced · Control & scale. For people who manage ads daily or for several clients:
// every account at once, configurable tables with filters, grouping, saved views and
// bulk actions, budget allocation and their own alert rules. Dense, fast, no hand-holding.

// ---------- Portfolio: all accounts ----------
function acctSummary(id) {
  const v = V(id);
  const tg = targetsFor(id);
  const goals = byGoalSpend(v);
  const main = goals[0] ?? null;
  const g = main ? goalOf(main, tg) : null;
  const off = goals.filter((o) => OFF.includes(goalOf(o, tg).state)).length;
  const probs = v.problems.filter((d) => isOpen(d) && shown(d));
  const high = probs.filter((d) => d.priority === "high");
  const atStake = probs.reduce((s, d) => s + (d.impact?.known ? d.impact.amount : 0), 0);
  const top = [...probs].sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || byImpact(a, b))[0] ?? null;
  const opps = v.opportunities.filter((d) => isOpen(d) && shown(d));
  const tone = high.length || (g && TONE[g.state] === "bad") ? "bad" : probs.length || off ? "warn" : "good";
  return { id, v, goals, main, g, off, probs, high, atStake, top, opps, tone };
}
function advPortfolio() {
  const all = ACCTS.map((a) => acctSummary(a.id)).sort((a, b) => b.atStake - a.atStake);
  const spend = all.reduce((s, x) => s + x.v.spend, 0);
  const needs = all.filter((x) => x.tone === "bad").length;
  const stake = all.reduce((s, x) => s + x.atStake, 0);
  const highN = all.reduce((s, x) => s + x.high.length, 0);
  const cross = all.flatMap((x) => x.high.map((d) => ({ id: x.id, d }))).sort((a, b) => byImpact(a.d, b.d)).slice(0, 6);
  const TONE_WORD = { bad: "Needs action", warn: "Watch", good: "Healthy" };
  return `
  <div class="statusbar">
    <span class="stat"><span class="num">${money(spend)}</span> spend across ${plural(all.length, "account")}</span>
    <span class="stat ${needs ? "hi" : ""}"><span class="num">${needs}</span> ${needs === 1 ? "account needs" : "accounts need"} action</span>
    <span class="stat ${stake ? "hi" : ""}"><span class="num">${money(stake)}</span> at stake</span>
    <span class="stat"><span class="num">${highN}</span> high-priority problems</span>
  </div>
  <section class="section">
    ${sectionHead("Accounts", "Sorted by money at stake. Click an account to open it.")}
    <div class="tablewrap"><table class="tbl" style="min-width:1000px"><thead><tr><th>Account</th><th>Status</th><th class="r">Spend</th><th>Main goal</th><th class="r">Goals off track</th><th class="r">Problems</th><th class="r">At stake</th><th class="r">Opportunities</th><th>Top problem</th></tr></thead><tbody>
    ${all.map((x) => { const a = ACCTS.find((y) => y.id === x.id); const [gc, gw] = x.g ? STATE[x.g.state] : ["flat", "—"]; return `<tr class="click" data-acctgo="${x.id}" tabindex="0">
      <td><div class="nm">${esc(a.name)}</div><div class="sub">${esc([a.industry, a.country].filter(Boolean).join(" · "))}</div></td>
      <td><span class="tag ${x.tone === "bad" ? "bad" : x.tone === "warn" ? "warn" : "good"}">${TONE_WORD[x.tone]}</span></td>
      <td class="r"><div class="num">${money(x.v.spend)}</div>${deltaChip(x.v.spendChange, "neutral")}</td>
      <td>${x.main ? `<div>${esc(x.main.label)} · <span class="num">${esc(x.main.kpiShort)} ${kpi(x.main.value, x.main.mode)}</span></div><div class="sub"><span class="state ${gc}">${gw}</span>${x.g.target != null ? `target ${kpi(x.g.target, x.main.mode)}` : "no target"}</div>` : "—"}</td>
      <td class="r num">${x.off} of ${x.goals.length}</td>
      <td class="r num">${x.probs.length}${x.high.length ? ` <span class="prio high">${x.high.length} high</span>` : ""}</td>
      <td class="r num ${x.atStake ? "worst" : ""}">${money(x.atStake)}</td>
      <td class="r num">${x.opps.length}</td>
      <td>${x.top ? `<button class="link" type="button" data-xkey="${x.id}|${esc(x.top.key)}">${esc(x.top.title)}</button>` : '<span class="small-note">None</span>'}</td>
    </tr>`; }).join("")}
    </tbody></table></div>
  </section>
  <section class="section">
    ${sectionHead("Needs action now, across accounts", "High-priority problems, biggest money first")}
    ${cross.length ? `<div class="rows">${cross.map(({ id, d }, i) => `<button class="irow orow ${d.priority}" type="button" data-xkey="${id}|${esc(d.key)}"><span class="n">${i + 1}</span><span class="body"><span class="tags"><span class="plat">${esc(ACCTS.find((a) => a.id === id).name)}</span>${kindTag(kindOf(d))}</span><span class="t">${esc(d.title)}</span>${d.where ? `<span class="path">${pathHtml(d.where)}</span>` : ""}</span><span class="side-r">${impactChip(d)}${confLabel(d.confidence)}</span></button>`).join("")}</div>` : emptyState("Nothing urgent", "No high-priority problems in any account for this period.")}
  </section>
  <p class="small-note">All four accounts are the sample businesses that ship with AdMate. In the app, this shows every ad account you manage; agencies would add client permissions and scheduled client reports (not built yet).</p>`;
}

// ---------- Overview (dense) ----------
function advOverview() {
  const v = V();
  if (!v.objectives.length) return emptyState("No ad spend in this period", "Pick another period above.");
  const goals = byGoalSpend(v);
  const probs = openProblems(v);
  const high = probs.filter((d) => d.priority === "high").length;
  const atStake = probs.reduce((s, d) => s + (d.impact?.known ? d.impact.amount : 0), 0);
  const opps = v.opportunities.filter((d) => isOpen(d) && shown(d)).length;
  const fired = alertCount(v);
  if (!ui.trendObj || !goals.some((o) => o.objective === ui.trendObj)) ui.trendObj = goals[0].objective;
  const trend = goals.find((o) => o.objective === ui.trendObj);
  const dcell = (o, key) => { const d = o.drivers?.find((x) => x.key === key); return d ? `<td class="r"><span class="delta ${d.helped ? "good" : "bad"}" title="${Math.round(d.weight * 100)}% of the movement">${signed(d.change)}</span></td>` : '<td class="r muted">—</td>'; };
  return `
  <div class="statusbar">
    <span class="stat"><span class="num">${money(v.spend)}</span> spend ${deltaChip(v.spendChange, "neutral")}</span>
    <button class="stat ${high ? "hi" : ""}" type="button" data-go="actions"><span class="num">${probs.length}</span> problems (${high} high) · <span class="num">${money(atStake)}</span> at stake</button>
    <button class="stat ${opps ? "good" : ""}" type="button" data-go="actions"><span class="num">${opps}</span> opportunities</button>
    <button class="stat ${fired ? "hi" : ""}" type="button" data-go="alerts"><span class="num">${fired}</span> ${fired === 1 ? "alert" : "alerts"}</button>
  </div>
  <section class="section">
    ${sectionHead("Goals", `${esc(v.label)}${v.compareLabel ? ` vs ${esc(v.compareLabel)}` : ""}${v.history ? ` · history ${esc(v.history)}` : ""}`)}
    <div class="tablewrap"><table class="tbl dense" style="min-width:1000px"><thead><tr><th>Goal</th><th class="r">Main result</th><th class="r">Δ</th><th class="r">Target</th><th class="r">Break-even</th><th>Status</th><th class="r">Results</th><th class="r">Spend</th><th class="r">Share</th><th>Conf.</th><th>4 weeks</th></tr></thead><tbody>
    ${goals.map((o) => { const g = goalOf(o); const [c, w] = STATE[g.state]; return `<tr class="click${o.objective === ui.trendObj ? " sel" : ""}" data-trend="${o.objective}"><td><b style="font-weight:500">${esc(o.label)}</b></td><td class="r num">${esc(o.kpiShort)} ${kpi(o.value, o.mode)}</td><td class="r">${deltaChip(o.change, o.mode, o.confidence)}</td><td class="r num">${g.target != null ? kpi(g.target, o.mode) : "—"}</td><td class="r num">${g.breakEven != null ? kpi(g.breakEven, o.mode) : "—"}</td><td><span class="state ${c}">${w}</span></td><td class="r num">${n0(o.results)}</td><td class="r num">${money(o.spend)}</td><td class="r num">${pct(o.share, 1)}</td><td>${confDots(o.confidence)}</td><td>${spark(o.daily, g.target, 90, 24)}</td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="chartbox"><span class="title">${esc(trend.label)}: ${esc(trend.resultLabel)} per day and ${esc(trend.kpiShort)} <span class="small-note">(click a goal row to switch)</span></span>${dailyChart({ mode: trend.mode, kpiShort: trend.kpiShort, kpiLabel: trend.kpiLabel, resultLabel: trend.resultLabel, days: trend.daily.map((d) => ({ date: d.date, weekday: D0(d.date).getUTCDay(), spend: d.spend, results: d.results, kpi: d.v })) }, v.from, v.to, { h: 190 })}</div>
  </section>
  <section class="section">
    ${sectionHead(`Why goals moved ${src("read")}`, v.compareLabel ? "Each driver’s change; green helped the result, red hurt it (hover for its share)" : "")}
    ${v.compareLabel ? `<div class="tablewrap"><table class="tbl dense" style="min-width:900px"><thead><tr><th>Goal</th><th class="r">Δ main result</th><th class="r">CPM</th><th class="r">CTR</th><th class="r">Conv. rate</th><th class="r">Result rate</th><th class="r">Order value</th><th>Biggest mover</th></tr></thead><tbody>
      ${goals.filter((o) => o.change != null).map((o) => { const m = o.movers?.[0]; return `<tr><td>${esc(o.label)}</td><td class="r">${deltaChip(o.change, o.mode, o.confidence)}</td>${dcell(o, "cpm")}${dcell(o, "ctr")}${dcell(o, "cvr")}${dcell(o, "rate")}${dcell(o, "aov")}<td>${m ? `<button class="link" type="button" data-entity="campaign:${esc(m.id)}">${esc(m.name)}</button> <span class="impact ${m.worse ? "bad" : "good"}"><b>${money(Math.abs(m.amount))}</b> <small>${impactWord(m.mode, m.worse)}</small></span>` : '<span class="muted">—</span>'}</td></tr>`; }).join("")}
    </tbody></table></div>` : emptyState("No comparison period", "Pick one in the date picker to split each change into its drivers.")}
  </section>
  ${v.dataNotes.length ? `<section class="section">${sectionHead("Data notes", "Things that affect how far these numbers can be trusted")}<ul style="margin:0;padding-left:18px;display:grid;gap:4px" class="small">${v.dataNotes.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul></section>` : ""}`;
}

// ---------- Actions: a work queue with bulk decisions ----------
const DETECTOR_NAME = {
  plan: "Campaign plan", tracking_break: "Tracking break", post_click_drop: "Landing page / checkout drop", creative_fatigue: "Creative fatigue", cpm_spike: "Ad cost spike",
  wasted_spend: "Wasted spend", revenue_break: "Revenue tracking break", underperformer: "Underperformer", budget_concentration: "Budget concentration", saturation: "Audience saturation",
  kpi_worsened: "Result worsened", spend_up_results_down: "Spend up, results down", ad_ctr_drop: "Ad click-rate drop", zero_results_child: "Ad set / ad with no results", no_delivery: "No delivery",
  budget_winner: "Under-funded winner", strong_performer: "Ad worth copying", lesson_winner: "Lesson: winner", lesson_underperformer: "Lesson: avoid", cross_platform: "Cross-platform shift",
};
function advActions() {
  const v = V();
  let list = optimizeQueue(v, ui.actFilter, ui.actSort);
  if (ui.actPrio !== "all") list = list.filter((d) => d.priority === ui.actPrio);
  const q = (ui.actQ ?? "").trim().toLowerCase();
  if (q) list = list.filter((d) => `${d.title} ${d.where ?? ""}`.toLowerCase().includes(q));
  for (const k of [...ui.actSel]) if (!list.some((d) => d.key === k)) ui.actSel.delete(k);
  const counts = { open: optimizeQueue(v, "open").length, fix: optimizeQueue(v, "fix").length, grow: optimizeQueue(v, "grow").length, watch: optimizeQueue(v, "watch").length, done: optimizeQueue(v, "done").length };
  const names = { open: "Open", fix: "Problems", grow: "Opportunities", watch: "Watch", done: "Done" };
  const n = ui.actSel.size;
  return `<section class="section">
    ${sectionHead("Actions", "Every item once. Tick several to decide in bulk; click a row to investigate.")}
    <div class="toolbar">
      <div class="filters" role="group" aria-label="Show">${Object.keys(names).map((k) => `<button type="button" data-actf="${k}" aria-pressed="${k === ui.actFilter}">${names[k]} <span class="num">${counts[k]}</span></button>`).join("")}</div>
      <span class="grow"></span>
      <select class="sel" id="actPrio" aria-label="Priority"><option value="all">All priorities</option>${["high", "medium", "low"].map((p) => `<option value="${p}" ${ui.actPrio === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)} only</option>`).join("")}</select>
      <select class="sel" id="actSort" aria-label="Sort"><option value="impact" ${ui.actSort === "impact" ? "selected" : ""}>Sort: money at stake</option><option value="priority" ${ui.actSort === "priority" ? "selected" : ""}>Sort: priority</option><option value="confidence" ${ui.actSort === "confidence" ? "selected" : ""}>Sort: confidence</option></select>
      <input class="inp" id="actQ" type="search" placeholder="Search…" value="${esc(ui.actQ ?? "")}" aria-label="Search actions">
    </div>
    ${list.length ? `<div class="tablewrap"><table class="tbl dense" style="min-width:980px"><thead><tr><th><input type="checkbox" data-asel-all aria-label="Select all" ${n && n === list.length ? "checked" : ""}></th><th>Priority</th><th>Item</th><th>Check</th><th class="r">Money at stake</th><th>Confidence</th><th>Status</th></tr></thead><tbody>
      ${list.map((d) => `<tr class="click${ui.actSel.has(d.key) ? " sel" : ""}" data-key="${esc(d.key)}"><td><input type="checkbox" data-asel="${esc(d.key)}" aria-label="Select" ${ui.actSel.has(d.key) ? "checked" : ""}></td><td>${prioChip(d.priority)}</td><td><div class="nm">${kindTag(kindOf(d))} ${esc(d.title)}</div>${d.where ? `<div class="sub">${pathHtml(d.where)}</div>` : ""}</td><td class="small">${esc(DETECTOR_NAME[d.detector] ?? d.detector)}</td><td class="r">${impactChip(d) || '<span class="muted">—</span>'}</td><td>${confDots(d.confidence)}</td><td class="small">${decided[d.key] ? esc(STATUS_TEXT(decided[d.key])) : "Open"}</td></tr>`).join("")}
    </tbody></table></div>` : emptyState("Nothing here", "No items match these filters.")}
    ${n ? `<div class="bulkbar" role="region" aria-label="Bulk actions"><span>${plural(n, "item")} selected</span>${ui.actFilter === "done" ? `<button class="btn small" type="button" data-bulk="restore">Undo</button>` : `<button class="btn small" type="button" data-bulk="done">Action taken</button><button class="btn small" type="button" data-bulk="remind">Remind in 3 days</button><button class="btn small" type="button" data-bulk="dismissed">Dismiss</button>`}<button class="btn small" type="button" data-bulk="clear">Clear</button></div>` : ""}
  </section>`;
}

// ---------- Explorer: configurable table ----------
const COLS = {
  platform: { label: "Platform", get: (r) => PLATFORM[r.platform], txt: true },
  objective: { label: "Goal", get: (r) => r.objectiveLabel, txt: true },
  role: { label: "Funnel role", get: (r) => ROLE[roles[r.id] ?? r.role], txt: true },
  spend: { label: "Spend", get: (r) => r.spend, fmt: (x) => money(x) },
  share: { label: "Share", get: (r) => r.share, fmt: (x) => pct(x, 1) },
  spendChange: { label: "Spend Δ", get: (r) => r.spendChange, fmt: (x) => (x == null ? "—" : signed(x)) },
  impressions: { label: "Impr.", get: (r) => r.impressions, fmt: n0 },
  reach: { label: "Reach", get: (r) => r.reach, fmt: n0 },
  frequency: { label: "Freq.", get: (r) => r.frequency, fmt: n1 },
  clicks: { label: "Clicks", get: (r) => r.clicks, fmt: n0 },
  ctr: { label: "CTR", get: (r) => r.ctr, fmt: (x) => pct(x, 2) },
  cpc: { label: "CPC", get: (r) => r.cpc, fmt: (x) => money(x) },
  cpm: { label: "CPM", get: (r) => r.cpm, fmt: (x) => money(x) },
  results: { label: "Results", get: (r) => (r.mode === "cpm" ? null : r.results), fmt: n0 },
  cvr: { label: "Conv. rate", get: (r) => r.cvr, fmt: (x) => pct(x, 1) },
  kpi: { label: "Main result", get: (r) => r.kpi, fmt: (x, r) => `${esc(r.kpiShort)} ${kpi(x, r.mode)}` },
  change: { label: "Δ main", get: (r) => (r.change == null ? null : higher(r.mode) ? r.change : -r.change), fmt: (x, r) => deltaChip(r.change, r.mode, r.confidence), csv: (r) => r.change },
  expected: { label: "Expected", get: (r) => r.expected, fmt: (x, r) => kpi(x, r.mode) },
  impact: { label: "Money at stake", get: (r) => (r.impact ? (r.impact.label === "extra cost" || r.impact.label === "lost revenue" ? r.impact.amount : -r.impact.amount) : null), fmt: (x, r) => (r.impact ? impactChip({ impact: r.impact }) : "—") },
  priority: { label: "Priority", get: (r) => PRIO_RANK[r.priority] ?? 9, fmt: (x, r) => prioChip(r.priority), csv: (r) => r.priority ?? "" },
  confidence: { label: "Conf.", get: (r) => CONF_RANK[r.confidence], fmt: (x, r) => confDots(r.confidence), csv: (r) => r.confidence },
  next: { label: "Next step", get: (r) => r.label ?? "", txt: true },
};
const DEFAULT_COLS = ["spend", "share", "results", "kpi", "change", "ctr", "cpm", "frequency", "impact", "priority", "next"];
const QUICK_VIEWS = [
  { name: "Where money leaks", state: { level: "campaign", group: "none", cols: ["spend", "kpi", "change", "expected", "impact", "priority", "next"], sort: { key: "impact", dir: -1 }, issues: true } },
  { name: "Creative check", state: { level: "ad", group: "campaign", cols: ["spend", "ctr", "cvr", "kpi", "change", "frequency", "next"], sort: { key: "spend", dir: -1 }, issues: false } },
  { name: "Audience fatigue", state: { level: "ad_group", group: "none", cols: ["spend", "frequency", "ctr", "change", "cpm", "next"], sort: { key: "frequency", dir: -1 }, issues: false } },
  { name: "Top spenders", state: { level: "campaign", group: "objective", cols: DEFAULT_COLS, sort: { key: "spend", dir: -1 }, issues: false } },
];
ui.ex = { level: "campaign", group: "none", cols: [...DEFAULT_COLS], sort: { key: "spend", dir: -1 }, q: "", obj: "", plat: "", prio: "all", issues: false, sel: new Set(), colsOpen: false, active: null };
const savedViews = () => LS.json("admate-views", []);
function exRows(v) {
  const e = ui.ex;
  const q = e.q.trim().toLowerCase();
  const hasIssue = (r) => r.kind === "issue" || v.problems.some((p) => p.entity?.id === r.id && isOpen(p) && shown(p));
  let rows = v.levels[e.level].filter((r) =>
    (!q || `${r.name} ${r.campaignName ?? ""} ${r.adSetName ?? ""}`.toLowerCase().includes(q)) &&
    (!e.obj || r.objective === e.obj) && (!e.plat || r.platform === e.plat) &&
    (e.prio === "all" || r.priority === e.prio) && (!e.issues || hasIssue(r)));
  const col = e.sort.key === "name" ? { get: (r) => r.name } : COLS[e.sort.key];
  if (col) rows = [...rows].sort((a, b) => { const x = col.get(a), y = col.get(b); if (x == null) return 1; if (y == null) return -1; return (typeof x === "string" ? x.localeCompare(y) : x - y) * e.sort.dir; });
  return rows;
}
function groupKey(r) {
  const g = ui.ex.group;
  return g === "objective" ? r.objectiveLabel : g === "platform" ? PLATFORM[r.platform] : g === "role" ? ROLE[roles[r.id] ?? r.role] : g === "campaign" ? r.campaignName ?? r.name : "";
}
function subtotal(rows) {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const same = rows.every((r) => r.mode === rows[0].mode && r.objective === rows[0].objective);
  const results = rows.reduce((s, r) => s + r.results, 0), revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const k = !same ? null : rows[0].mode === "roas" ? (spend > 0 ? revenue / spend : null) : rows[0].mode === "cpm" ? null : results > 0 ? spend / results : null;
  return { spend, results: same ? results : null, kpi: k, mode: rows[0]?.mode, kpiShort: rows[0]?.kpiShort };
}
function advExplorer() {
  const v = V();
  const e = ui.ex;
  const rows = exRows(v);
  for (const id of [...e.sel]) if (!rows.some((r) => r.id === id)) e.sel.delete(id);
  const objs = [...new Set(v.levels.campaign.map((r) => r.objective))];
  const plats = [...new Set(v.levels.campaign.map((r) => r.platform))];
  const head = `<tr><th><input type="checkbox" data-xsel-all aria-label="Select all" ${e.sel.size && e.sel.size === rows.length ? "checked" : ""}></th><th class="sortable" data-sort="name">Name ${e.sort.key === "name" ? (e.sort.dir > 0 ? "▲" : "▼") : ""}</th>${e.cols.map((c) => `<th class="sortable ${COLS[c].txt ? "" : "r"}" data-sort="${c}" title="Sort by ${esc(COLS[c].label)}">${T(COLS[c].label)} ${e.sort.key === c ? (e.sort.dir > 0 ? "▲" : "▼") : ""}</th>`).join("")}</tr>`;
  const cell = (r, c) => { const col = COLS[c]; const x = col.get(r); return `<td class="${col.txt ? "" : "r num"}">${col.fmt ? col.fmt(x, r) : esc(x ?? "")}</td>`; };
  const rowHtml = (r) => `<tr class="click${e.sel.has(r.id) ? " sel" : ""}" data-row="${r.level}:${esc(r.id)}"><td><input type="checkbox" data-xsel="${esc(r.id)}" aria-label="Select ${esc(r.name)}" ${e.sel.has(r.id) ? "checked" : ""}></td><td><div class="nm">${esc(r.name)}</div>${r.level !== "campaign" ? `<div class="sub">${esc(r.campaignName ?? "")}${r.level === "ad" ? ` › ${esc(r.adSetName ?? "")}` : ""}</div>` : ""}</td>${e.cols.map((c) => cell(r, c)).join("")}</tr>`;
  let body = "";
  if (e.group === "none") body = rows.map(rowHtml).join("");
  else {
    const groups = new Map();
    for (const r of rows) { const k = groupKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, list] of groups) {
      const st = subtotal(list);
      body += `<tr class="grouphead"><td></td><td>${esc(k)} <span class="small-note">· ${list.length}</span></td>${e.cols.map((c) => `<td class="r num">${c === "spend" ? money(st.spend) : c === "results" && st.results != null ? n0(st.results) : c === "kpi" && st.kpi != null ? `${esc(st.kpiShort)} ${kpi(st.kpi, st.mode)}` : ""}</td>`).join("")}</tr>${list.map(rowHtml).join("")}`;
    }
  }
  const tot = subtotal(rows);
  const saved = savedViews();
  return `<section class="section">
    ${sectionHead("Explorer", "Build the table you need: level, columns, filters, grouping. Save it as a view.")}
    <div class="excontrols">
      <div class="views"><span class="label">Quick views</span>${QUICK_VIEWS.map((q, i) => `<button class="v" type="button" data-qview="${i}" aria-pressed="${e.active === `q${i}`}">${esc(q.name)}</button>`).join("")}${saved.length ? `<span class="label" style="margin-left:8px">Saved</span>${saved.map((s, i) => `<button class="v" type="button" data-sview="${i}" aria-pressed="${e.active === `s${i}`}">${esc(s.name)}</button><button class="link small" type="button" data-sdel="${i}" aria-label="Delete view ${esc(s.name)}">✕</button>`).join("")}` : ""}</div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Level">${[["campaign", "Campaigns"], ["ad_group", "Ad sets"], ["ad", "Ads"]].map(([k, l]) => `<button type="button" data-xlevel="${k}" aria-pressed="${e.level === k}">${l} <span class="num">${v.levels[k].length}</span></button>`).join("")}</div>
        <label class="toggle">Group by <select class="sel" id="xGroup"><option value="none">Nothing</option>${[["objective", "Goal"], ["platform", "Platform"], ["role", "Funnel role"], ...(e.level !== "campaign" ? [["campaign", "Campaign"]] : [])].map(([k, l]) => `<option value="${k}" ${e.group === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <span class="colpick"><button class="btn small" type="button" data-cols aria-expanded="${e.colsOpen}">Columns (${e.cols.length}) ▾</button>${e.colsOpen ? `<div class="pop" role="group" aria-label="Columns">${Object.entries(COLS).map(([k, c]) => `<label><input type="checkbox" data-col="${k}" ${e.cols.includes(k) ? "checked" : ""}> ${esc(c.label)}</label>`).join("")}<button class="link small" type="button" data-colsreset style="grid-column:1/-1">Reset to default</button></div>` : ""}</span>
        <span class="grow"></span>
        <button class="btn small" type="button" data-csv="copy">Copy CSV</button>
        <button class="btn small" type="button" data-csv="download">Download CSV</button>
      </div>
      <div class="toolbar">
        <input class="inp" id="xQ" type="search" placeholder="Search names…" value="${esc(e.q)}" aria-label="Search">
        <select class="sel" id="xObj" aria-label="Goal"><option value="">All goals</option>${objs.map((o) => `<option value="${o}" ${e.obj === o ? "selected" : ""}>${esc(M().allObjectives.find((x) => x.objective === o).label)}</option>`).join("")}</select>
        <select class="sel" id="xPlat" aria-label="Platform"><option value="">All platforms</option>${plats.map((p) => `<option value="${p}" ${e.plat === p ? "selected" : ""}>${PLATFORM[p]}</option>`).join("")}</select>
        <select class="sel" id="xPrio" aria-label="Priority"><option value="all">All priorities</option>${["high", "medium", "low"].map((p) => `<option value="${p}" ${e.prio === p ? "selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`).join("")}</select>
        <label class="toggle"><input type="checkbox" id="xIssues" ${e.issues ? "checked" : ""}> Only items with a problem</label>
        <span class="grow"></span>
        <input class="inp" id="xViewName" placeholder="Name this view" aria-label="View name" style="width:150px"><button class="btn small" type="button" data-saveview>Save view</button>
      </div>
    </div>
    ${rows.length ? `<div class="tablewrap" style="max-height:70vh"><table class="tbl dense" style="min-width:${300 + e.cols.length * 96}px"><thead>${head}</thead><tbody>${body}</tbody></table></div>` : emptyState("No rows", "Nothing matches these filters. Clear the search or a filter.")}
    <p class="small-note">${plural(rows.length, "row")} · spend ${money(tot.spend)}${tot.results != null ? ` · ${n0(tot.results)} results` : ""}${tot.kpi != null ? ` · ${esc(tot.kpiShort)} ${kpi(tot.kpi, tot.mode)}` : ""}. Click a row to investigate; click a column to sort.</p>
    ${e.sel.size ? `<div class="bulkbar" role="region" aria-label="Bulk actions"><span>${plural(e.sel.size, "row")} selected: decide on their open items</span><button class="btn small" type="button" data-xbulk="done">Action taken</button><button class="btn small" type="button" data-xbulk="remind">Remind in 3 days</button><button class="btn small" type="button" data-xbulk="dismissed">Dismiss</button><button class="btn small" type="button" data-xbulk="clear">Clear</button></div>` : ""}
  </section>`;
}
function explorerCsv() {
  const v = V();
  const rows = exRows(v);
  const cols = ui.ex.cols;
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Level", "Name", "Campaign", "Ad set", ...cols.map((c) => COLS[c].label)].map(q).join(",");
  const lines = rows.map((r) => [LEVEL[r.level], r.name, r.campaignName ?? "", r.adSetName ?? "", ...cols.map((c) => { const col = COLS[c]; const x = col.csv ? col.csv(r) : col.get(r); return typeof x === "number" ? (Math.abs(x) < 1 ? x.toFixed(4) : x.toFixed(2)) : x ?? ""; })].map(q).join(","));
  return [head, ...lines].join("\n");
}
async function exportCsv(how) {
  const text = explorerCsv();
  const name = `admate-${acct}-${ui.ex.level}-${sel.a.from}-to-${sel.a.to}.csv`;
  if (how === "copy") {
    try { await navigator.clipboard.writeText(text); toast("Copied as CSV. Paste it into a spreadsheet."); } catch { toast("Your browser blocked copying here. Use Download CSV."); }
    return;
  }
  try {
    const dl = window.claude?.use ? await window.claude.use("downloads") : null;
    if (dl) { await dl.save({ filename: name, data: text }); return; }
  } catch (err) { if (err?.code) return toast("Download cancelled"); }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

