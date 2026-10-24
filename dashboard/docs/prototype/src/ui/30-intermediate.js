// Intermediate · Analyze & optimize. For people who run their own ads: what changed
// and WHY (which of ad cost, click rate and conversion rate drove it), optimizations
// ranked by money at stake with an "investigate" flow, and side-by-side comparisons
// of campaigns, audiences and creatives.

const OFF = ["far_off", "off_track", "worse"];
const impactWord = (mode, worse) => (mode === "roas" ? (worse ? "lost revenue" : "extra revenue") : worse ? "extra cost" : "saved");

// Open problems and opportunities, ranked by the money they involve (looking back).
function optimizeQueue(v, filter = "open", sort = "impact") {
  let list;
  if (filter === "done") return [...allItems(v), ...Object.values(v.details)].filter((d, i, arr) => decided[d.key] && arr.findIndex((x) => x.key === d.key) === i);
  if (filter === "fix") list = v.problems;
  else if (filter === "grow") list = v.opportunities;
  else if (filter === "watch") list = v.signals;
  else list = [...v.problems, ...v.opportunities];
  list = list.filter((d) => isOpen(d) && shown(d));
  const known = (d) => (d.impact?.known ? d.impact.amount : -1);
  const by = {
    impact: (x, y) => known(y) - known(x) || PRIO_RANK[x.priority] - PRIO_RANK[y.priority],
    priority: (x, y) => PRIO_RANK[x.priority] - PRIO_RANK[y.priority] || known(y) - known(x),
    confidence: (x, y) => CONF_RANK[x.confidence] - CONF_RANK[y.confidence] || known(y) - known(x),
  }[sort];
  return [...list].sort(by);
}
function orow(d, i, v = V()) {
  const dec = decided[d.key];
  const r = rowOf(d.entity, v);
  return `<button class="irow orow ${d.priority}${dec ? " closed" : ""}" type="button" data-key="${esc(d.key)}">
    <span class="n">${i + 1}</span>
    <span class="body"><span class="tags">${prioChip(d.priority)}${kindTag(kindOf(d))}${plat(d.platform)}${driverChip(r?.drivers)}</span>
      <span class="t">${esc(d.title)}</span>${d.where ? `<span class="path">${pathHtml(d.where)}</span>` : ""}${dec ? `<span class="sub">${esc(STATUS_TEXT(dec))}</span>` : ""}</span>
    <span class="side-r">${impactChip(d)}${confLabel(d.confidence)}<span class="link small">Investigate →</span></span>
  </button>`;
}

function goalTile(o, v) {
  const g = goalOf(o);
  const [cls, word] = STATE[g.state] ?? ["flat", ""];
  return `<button class="tile" type="button" data-trend="${o.objective}" aria-pressed="${o.objective === ui.trendObj}">
    <span class="k">${esc(o.label)} · ${T(o.kpiShort)}</span>
    <span class="v">${o.kpiMissing ? "—" : kpi(o.value, o.mode)}</span>
    <span class="row">${deltaChip(o.change, o.mode, o.confidence)}${spark(o.daily, g.target)}</span>
    <span class="t"><span class="state ${cls}">${word}</span> ${g.target != null ? `target ${kpi(g.target, o.mode)}` : "no target"}</span>
  </button>`;
}
function changeCard(o, v) {
  const worseNow = higher(o.mode) ? o.change < 0 : o.change > 0;
  return `<div class="card pad" style="display:grid;gap:12px">
    <div style="display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline"><b style="font-size:15px">${esc(o.label)}</b><span class="num">${T(o.kpiShort)} ${kpi(o.previous, o.mode)} → <b>${kpi(o.value, o.mode)}</b></span>${deltaChip(o.change, o.mode, o.confidence)}<span class="small-note">${worseNow ? "worse" : "better"} than ${esc(v.compareLabel)}</span></div>
    <div class="two" style="gap:18px">
      <div style="display:grid;gap:8px"><span>${src("read")} <b style="font-weight:500">Why</b></span>${o.drivers?.length ? `${driverBars(o.drivers)}<p class="small">${driverSentence(o.drivers, o.mode)}</p>` : `<p class="small-note">Not enough data to split this change into its causes.</p>`}</div>
      <div style="display:grid;gap:8px"><span>${src("data")} <b style="font-weight:500">Where it came from</b></span>${o.movers?.length ? `<div class="rows">${o.movers.map((m) => `<button class="irow" type="button" data-entity="campaign:${esc(m.id)}" style="padding-left:14px"><span class="body"><span class="t">${esc(m.name)}</span><span class="sub"><span class="num">${kpi(m.kpiA, m.mode)} → ${kpi(m.kpi, m.mode)}</span>${driverChip(m.drivers)}</span></span><span class="side-r"><span class="impact ${m.worse ? "bad" : "good"}"><b>${money(Math.abs(m.amount))}</b> <small>${impactWord(m.mode, m.worse)}</small></span><span class="link small">Investigate →</span></span></button>`).join("")}</div><p class="small-note">Money compared with each campaign’s own rate in ${esc(v.compareLabel)}.</p>` : `<p class="small-note">No single campaign stands out.</p>`}</div>
    </div>
  </div>`;
}

function intOverview() {
  const v = V();
  if (!v.objectives.length) return emptyState("No ad spend in this period", "Pick another period above, or upload a newer report.");
  const goals = byGoalSpend(v);
  const off = goals.filter((o) => OFF.includes(goalOf(o).state)).length;
  const probs = openProblems(v);
  const opps = v.opportunities.filter((d) => isOpen(d) && shown(d));
  const atStake = probs.reduce((s, d) => s + (d.impact?.known ? d.impact.amount : 0), 0);
  if (!ui.trendObj || !goals.some((o) => o.objective === ui.trendObj)) ui.trendObj = goals[0].objective;
  const trend = goals.find((o) => o.objective === ui.trendObj);
  const top = goals.slice(0, 4), rest = goals.slice(4);
  const changed = goals.filter((o) => o.change != null && Math.abs(o.change) >= 0.05 && o.previous != null).sort((a, b) => b.spend * Math.abs(b.change) - a.spend * Math.abs(a.change)).slice(0, 3);
  const queue = optimizeQueue(v).slice(0, 3);
  return `
  <div class="statusbar">
    <span class="stat ${off ? "hi" : ""}"><span class="num">${off}</span> ${off === 1 ? "goal" : "goals"} off track</span>
    <button class="stat ${probs.length ? "hi" : ""}" type="button" data-go="optimize" data-optf="fix"><span class="num">${probs.length}</span> problems · <span class="num">${money(atStake)}</span> at stake</button>
    <button class="stat ${opps.length ? "good" : ""}" type="button" data-go="optimize" data-optf="grow"><span class="num">${opps.length}</span> opportunities</button>
    <span class="stat"><span class="num">${money(v.spend)}</span> spend ${deltaChip(v.spendChange, "neutral")}</span>
  </div>
  ${v.oneLine ? `<p class="oneline">${src("read")} ${esc(v.oneLine)}</p>` : ""}
  <section class="section" aria-labelledby="kr-h">
    ${sectionHead('<span id="kr-h">Key results</span>', `Your biggest goals${v.compareLabel ? `, ▲▼ vs ${esc(v.compareLabel)}` : ""}. Click one to see its trend.`)}
    <div class="tiles">${top.map((o) => goalTile(o, v)).join("")}</div>
    ${rest.length ? `<p><button class="link" type="button" data-moregoals>${ui.moreGoals ? "Hide the smaller goals" : `Show ${plural(rest.length, "smaller goal")}`}</button></p>` : ""}
    ${ui.moreGoals && rest.length ? `<div class="tiles">${rest.map((o) => goalTile(o, v)).join("")}</div>` : ""}
    <div class="chartbox"><span class="title">${esc(trend.label)}: ${esc(trend.resultLabel)} per day and ${T(trend.kpiShort)}</span>${dailyChart({ mode: trend.mode, kpiShort: trend.kpiShort, kpiLabel: trend.kpiLabel, resultLabel: trend.resultLabel, days: trend.daily.map((d) => ({ date: d.date, weekday: D0(d.date).getUTCDay(), spend: d.spend, results: d.results, kpi: d.v })) }, v.from, v.to, { h: 180 })}</div>
  </section>
  <section class="section" aria-labelledby="wc-h">
    ${sectionHead('<span id="wc-h">What changed and why</span>', v.compareLabel ? `The biggest moves vs ${esc(v.compareLabel)}, split into their causes` : "")}
    ${!v.compareLabel ? emptyState("Pick a comparison period", "Choose “The period right before” or another period in the date picker to see what changed and why.") : changed.length ? changed.map((o) => changeCard(o, v)).join("") : emptyState("No big changes", `Every goal is within 5% of ${v.compareLabel}.`)}
  </section>
  <section class="section" aria-labelledby="to-h">
    ${sectionHead('<span id="to-h">Top optimizations</span>', "Ranked by money at stake", `<button class="link" type="button" data-go="optimize">All ${optimizeQueue(v).length} in Optimize →</button>`)}
    ${queue.length ? `<div class="rows">${queue.map((d, i) => orow(d, i, v)).join("")}</div>` : emptyState("Nothing to optimize right now", "Every campaign is in line with what AdMate expected.")}
  </section>`;
}

function intOptimize() {
  const v = V();
  const counts = { open: optimizeQueue(v, "open").length, fix: optimizeQueue(v, "fix").length, grow: optimizeQueue(v, "grow").length, watch: optimizeQueue(v, "watch").length, done: optimizeQueue(v, "done").length };
  const list = optimizeQueue(v, ui.optFilter, ui.optSort);
  const names = { open: "All open", fix: "Fix problems", grow: "Grow", watch: "Watch", done: "Done & reminders" };
  const empty = { open: "Nothing to optimize right now.", fix: "No open problems.", grow: "No open opportunities.", watch: "Nothing to watch: early signals appear here before they’re confirmed.", done: "Nothing yet. Open an item and choose Action taken, Remind me later or Dismiss." };
  return `<section class="section">
    ${sectionHead("Optimize", "Every problem and opportunity once, ranked by the money involved. Open one to investigate why.")}
    <div class="toolbar">
      <div class="filters" role="group" aria-label="Show">${Object.keys(names).map((k) => `<button type="button" data-optf="${k}" aria-pressed="${k === ui.optFilter}">${names[k]} <span class="num">${counts[k]}</span></button>`).join("")}</div>
      <span class="grow"></span>
      <label class="toggle">Sort by <select class="sel" id="optSort"><option value="impact" ${ui.optSort === "impact" ? "selected" : ""}>Money at stake</option><option value="priority" ${ui.optSort === "priority" ? "selected" : ""}>Priority</option><option value="confidence" ${ui.optSort === "confidence" ? "selected" : ""}>Confidence</option></select></label>
    </div>
    ${legend()}
    ${list.length ? `<div class="rows">${list.map((d, i) => orow(d, i, v)).join("")}</div>` : emptyState("Nothing here", empty[ui.optFilter])}
    <p class="small-note">Money at stake looks back only: the extra cost, lost revenue or savings against what AdMate expected (an item’s own past, your target or similar items). It is not a forecast.</p>
  </section>`;
}

// ---------- Campaigns: campaign › ad set › ad, with side-by-side compare ----------
function intCampaigns() {
  const v = V();
  if (!v.levels.campaign.length) return emptyState("No campaign spent money in this period", "Pick another period above.");
  const lvl = ui.campLevel;
  const camps = v.levels.campaign.filter((r) => !ui.objFilter || r.objective === ui.objFilter);
  const objs = [...new Set(v.levels.campaign.map((r) => r.objective))];
  const n = ui.compare.size;
  const adv = isAdv(); // Advanced adds CPM, frequency and money at stake, in a denser table
  const cells = (r, depth, tw = "") => {
    const role = roles[r.id] ?? r.role, obj = objectiveOverride[r.id] ?? r.objective;
    const ck = `${r.level}:${r.id}`;
    const ctl = depth === 0 ? `<select data-objsel="${esc(r.id)}" aria-label="Objective">${M().allObjectives.map((o) => `<option value="${o.objective}" ${o.objective === obj ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select><select data-role="${esc(r.id)}" aria-label="Funnel role">${Object.entries(ROLE).map(([k, nm]) => `<option value="${k}" ${k === role ? "selected" : ""}>${nm}${k === r.role && !roles[r.id] ? " (guessed)" : ""}</option>`).join("")}</select>` : "";
    const crumb = r.level === "ad_group" ? `<span>in <b>${esc(r.campaignName)}</b></span>` : r.level === "ad" ? `<span>in <b>${esc(r.campaignName)}</b> › <b>${esc(r.adSetName)}</b></span>` : "";
    return `<td><input type="checkbox" data-cmp="${esc(ck)}" aria-label="Compare ${esc(r.name)}" ${ui.compare.has(ck) ? "checked" : ""} ${!ui.compare.has(ck) && n >= 3 ? "disabled" : ""}></td>
      <td>${prioChip(r.priority)} ${kindTag(r.kind)}</td>
      <td><div class="nm">${tw}<span class="lvl">${LEVEL[r.level]}</span><span>${esc(r.name)}</span></div><div class="sub">${plat(r.platform)}${depth ? `<span>${esc(r.objectiveLabel)}</span>` : ""}${crumb}${ctl}</div></td>
      <td class="r"><div class="num">${money(r.spend)}</div><div class="was num">${pct(r.share)} of all</div></td>
      <td class="r"><div class="num">${T(r.kpiShort)} ${kpi(r.kpi, r.mode)}</div>${deltaChip(r.change, r.mode, r.confidence)}${r.kpiA != null ? `<div class="was num">was ${kpi(r.kpiA, r.mode)}</div>` : ""}</td>
      <td class="r"><div class="num">${r.mode === "cpm" ? "—" : n0(r.results)}</div><div class="was">${r.mode === "cpm" ? "judged by CPM" : esc(r.resultLabel)}</div></td>
      <td class="r num">${pct(r.ctr, 2)}</td>
      ${adv ? `<td class="r num">${money(r.cpm)}</td><td class="r num">${n1(r.frequency)}</td><td class="r">${r.impact ? impactChip({ impact: r.impact }) : '<span class="muted">—</span>'}</td>` : ""}
      <td>${esc(r.label ?? "")}</td>`;
  };
  let body = "";
  if (lvl === "campaign") {
    for (const c of camps) {
      const sets = v.levels.ad_group.filter((s) => s.campaignId === c.id);
      const open = ui.expanded.has(c.id);
      body += `<tr class="click" data-row="campaign:${esc(c.id)}" tabindex="0">${cells(c, 0, sets.length ? `<button class="tw" type="button" data-expand="${esc(c.id)}" aria-expanded="${open}" aria-label="${open ? "Hide" : "Show"} ad sets">${open ? "▾" : "▸"}</button>` : "")}</tr>`;
      if (!open) continue;
      for (const s of sets) {
        const ads = v.levels.ad.filter((a) => a.adSetId === s.id);
        const sOpen = ui.expanded.has(s.id);
        body += `<tr class="click lv1" data-row="ad_group:${esc(s.id)}" tabindex="0">${cells(s, 1, ads.length ? `<button class="tw" type="button" data-expand="${esc(s.id)}" aria-expanded="${sOpen}" aria-label="${sOpen ? "Hide" : "Show"} ads">${sOpen ? "▾" : "▸"}</button>` : "")}</tr>`;
        if (sOpen) for (const a of ads) body += `<tr class="click lv2" data-row="ad:${esc(a.id)}" tabindex="0">${cells(a, 2)}</tr>`;
      }
    }
  } else {
    for (const c of camps) {
      const items = v.levels[lvl].filter((x) => x.campaignId === c.id);
      if (!items.length) continue;
      body += `<tr class="grouphead"><td colspan="${adv ? 11 : 8}"><span class="lvl">Campaign</span> ${esc(c.name)} <span class="small-note">· ${esc(c.objectiveLabel)} · ${PLATFORM[c.platform]}</span></td></tr>`;
      for (const x of items) body += `<tr class="click ${lvl === "ad_group" ? "lv1" : "lv2"}" data-row="${lvl}:${esc(x.id)}" tabindex="0">${cells(x, lvl === "ad_group" ? 1 : 2)}</tr>`;
    }
  }
  return `<section class="section">
    ${sectionHead("Campaigns", `${esc(v.label)} · ▸ shows a campaign’s ad sets and ads · tick 2 or 3 rows to compare them${adv ? " · Explorer has custom columns and saved views" : ""}`)}
    <div class="toolbar">
      <div class="filters" role="group" aria-label="Level">${[["campaign", "Campaign › ad set › ad"], ["ad_group", "All ad sets"], ["ad", "All ads"]].map(([k, nm]) => `<button type="button" data-level="${k}" aria-pressed="${k === lvl}">${nm} <span class="num">${v.levels[k].length}</span></button>`).join("")}</div>
      <span class="grow"></span>
      ${lvl === "campaign" ? `<button class="btn small" type="button" data-expandall>${camps.every((c) => ui.expanded.has(c.id)) ? "Collapse all" : "Expand all"}</button>` : ""}
      <button class="btn ${n >= 2 ? "primary" : ""}" type="button" data-compare ${n >= 2 ? "" : "disabled"}>Compare ${n ? `(${n})` : ""}</button>
      ${n ? `<button class="link" type="button" data-cmpclear>Clear</button>` : ""}
    </div>
    <div class="filters" role="group" aria-label="Goal"><button type="button" data-obj="" aria-pressed="${!ui.objFilter}">All goals</button>${objs.map((o) => `<button type="button" data-obj="${o}" aria-pressed="${ui.objFilter === o}">${esc(M().allObjectives.find((x) => x.objective === o).label)}</button>`).join("")}</div>
    <div class="tablewrap"><table class="tbl${adv ? " dense" : ""}" style="min-width:${adv ? 1180 : 920}px"><thead><tr><th><span class="sr">Compare</span></th><th>Priority · state</th><th>Name</th><th class="r">Spend</th><th class="r">Main result ${v.compareLabel ? `(▲▼ vs ${esc(v.compareLabel)})` : ""}</th><th class="r">Results</th><th class="r">${T("CTR")}</th>${adv ? `<th class="r">CPM</th><th class="r">Freq.</th><th class="r">Money at stake</th>` : ""}<th>Next step</th></tr></thead><tbody>${body}</tbody></table></div>
  </section>`;
}

// Why one item beats another, from the same metric tree the engine uses:
// cost per result = CPM ÷ (1000 × CTR × conversion rate); ROAS adds order value.
function keyDifference(a, b) {
  const better = (higher(a.mode) ? a.kpi >= b.kpi : a.kpi <= b.kpi) ? a : b;
  const worse = better === a ? b : a;
  if (better.kpi == null || worse.kpi == null || better.kpi === worse.kpi) return "";
  const terms = [];
  const add = (key, label, vb, vw, sign, fmt) => { if (vb > 0 && vw > 0) terms.push({ key, label, val: sign * Math.log(vb / vw), vb, vw, fmt }); };
  add("cpm", "showing the ads costs less", better.cpm, worse.cpm, -1, money);
  if (better.cvr != null && worse.cvr != null) {
    add("ctr", "more of the people who see it click", better.ctr, worse.ctr, 1, (x) => pct(x, 2));
    add("cvr", "more of the people who click go on to act", better.cvr, worse.cvr, 1, (x) => pct(x, 1));
  } else {
    add("rate", "more of the people who see it act", better.results / better.impressions, worse.results / worse.impressions, 1, (x) => pct(x, 2));
  }
  if (better.mode === "roas" && better.results > 0 && worse.results > 0) add("aov", "each order is worth more", better.revenue / better.results, worse.revenue / worse.results, 1, money);
  const m = terms.sort((x, y) => y.val - x.val)[0];
  if (!m || m.val <= 0) return "";
  const gap = higher(better.mode) ? better.kpi / worse.kpi - 1 : 1 - better.kpi / worse.kpi;
  return `“${esc(better.name)}” does ${Math.round(gap * 100)}% better than “${esc(worse.name)}” on ${esc(better.kpiShort)}, mainly because ${m.label} (${m.fmt(m.vb)} vs ${m.fmt(m.vw)}).`;
}
function overlayChart(list, from, to) {
  const ser = list.filter((x) => x.series && x.series.days.length > 1);
  if (!ser.length) return "";
  const W = 640, H = 190, L0 = 50, R = 12, T0 = 14, B = 26;
  const n = ser[0].series.days.length;
  const all = ser.flatMap((s) => s.series.days.map((d) => d.kpi)).filter((x) => x != null && x > 0);
  const max = (all.length ? Math.max(...all) : 1) * 1.12;
  const x = (i) => L0 + (i / Math.max(1, n - 1)) * (W - L0 - R), y = (v) => H - B - (v / max) * (H - T0 - B);
  const colors = ["var(--violet)", "var(--c2)", "var(--c3)"], dash = ["", "6 4", "2 3"];
  const ds = ser[0].series.days;
  const i0 = ds.findIndex((d) => d.date >= from), i1 = ds.length - 1 - [...ds].reverse().findIndex((d) => d.date <= to);
  const lines = ser.map((s, k) => { let p = ""; s.series.days.forEach((d, i) => { if (d.kpi == null || d.kpi <= 0) return; p += (p && s.series.days[i - 1]?.kpi > 0 ? "L" : "M") + x(i).toFixed(1) + "," + y(d.kpi).toFixed(1) + " "; }); return `<path d="${p}" fill="none" stroke="${colors[k]}" stroke-width="2" stroke-dasharray="${dash[k]}" stroke-linejoin="round"/>`; }).join("");
  const step = Math.max(1, Math.ceil(n / 7));
  return `<div class="chartbox"><span class="title">${T(ser[0].series.kpiShort)} per day</span><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Main result per day for each compared item">
    ${i0 >= 0 ? `<rect x="${x(i0)}" y="${T0 - 6}" width="${Math.max(2, x(i1) - x(i0))}" height="${H - T0 - B + 6}" fill="var(--violet-soft)"/>` : ""}
    ${[0, max / 2, max].map((vv) => `<line x1="${L0}" x2="${W - R}" y1="${y(vv)}" y2="${y(vv)}" stroke="var(--line)" stroke-width="0.8"/><text x="${L0 - 6}" y="${y(vv) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${kpi(vv, ser[0].series.mode)}</text>`).join("")}
    ${lines}
    ${ds.map((d, i) => (i % step === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${fmtDate(d.date)}</text>` : "")).join("")}
  </svg><div class="legend">${ser.map((s, k) => `<span><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="${colors[k]}" stroke-width="2.5" stroke-dasharray="${dash[k]}"/></svg>${esc(s.name)}</span>`).join("")}<span><i class="sw" style="background:var(--violet-soft)"></i>selected period</span></div></div>`;
}
function openCompare() {
  const v = V();
  const items = [...ui.compare].map((k) => { const [lv, id] = k.split(":"); return v.levels[lv]?.find((r) => r.id === id); }).filter(Boolean);
  if (items.length < 2) return toast("Tick 2 or 3 rows to compare");
  const same = items.every((r) => r.objective === items[0].objective && r.mode === items[0].mode);
  const best = (vals, hi) => { const xs = vals.filter((x) => x != null); return xs.length ? (hi ? Math.max(...xs) : Math.min(...xs)) : null; };
  const metric = (label, get, fmt, hi) => {
    const vals = items.map(get);
    const b = hi == null ? null : best(vals, hi), w = hi == null ? null : best(vals, !hi);
    return `<tr><th scope="row" style="position:static;text-transform:none;letter-spacing:0;font-family:var(--font-display);font-size:13px">${label}</th>${vals.map((x) => `<td class="r num ${hi != null && x != null && vals.filter((y) => y != null).length > 1 && x === b ? "best" : hi != null && x != null && x === w && b !== w ? "worst" : ""}">${fmt(x)}</td>`).join("")}</tr>`;
  };
  const kpiRow = same ? metric(T(items[0].kpiShort), (r) => r.kpi, (x) => kpi(x, items[0].mode), higher(items[0].mode)) : `<tr><th scope="row" style="position:static;text-transform:none;letter-spacing:0;font-family:var(--font-display);font-size:13px">Main result</th>${items.map((r) => `<td class="r num">${T(r.kpiShort)} ${kpi(r.kpi, r.mode)}</td>`).join("")}</tr>`;
  const ranked = items.filter((r) => r.kpi != null).sort((a, b) => (higher(a.mode) ? b.kpi - a.kpi : a.kpi - b.kpi)); // best first
  const diff = same && ranked.length >= 2 ? keyDifference(ranked[0], ranked[ranked.length - 1]) : "";
  const series = items.map((r) => ({ name: r.name, series: E.daily(r.level, r.id, v.from, v.to, acct) }));
  $("#overlay").innerHTML = `<div class="scrim" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cm-t"><article class="mbox">
    <header><div><span class="label">Compare · ${esc(v.label)}</span><h2 id="cm-t">${plural(items.length, LEVEL[items[0].level].toLowerCase())} side by side</h2></div><button class="btn" type="button" data-close>Close</button></header>
    <div class="mbody">
      ${!same ? `<p class="warnbox">These have different goals, so their main results can’t be compared directly. Compare spend, clicks and costs instead.</p>` : ""}
      ${diff ? `<p>${src("read")} ${diff}</p>` : ""}
      ${same && new Set(items.map((r) => roles[r.campaignId] ?? r.role)).size > 1 ? `<p class="small-note">Note: these have different funnel roles (${[...new Set(items.map((r) => ROLE[roles[r.campaignId] ?? r.role]))].join(" vs ")}). Retargeting and existing-customer audiences usually cost less, so AdMate never judges one against the other.</p>` : ""}
      <div class="tablewrap"><table class="tbl"><thead><tr><th>${src("data")}</th>${items.map((r) => `<th style="text-transform:none;letter-spacing:0;font-family:var(--font-display);font-size:12.5px;color:var(--fg);white-space:normal">${esc(r.name)}<div class="small-note">${LEVEL[r.level]} · ${PLATFORM[r.platform]}</div></th>`).join("")}</tr></thead><tbody>
        ${metric("Goal", (r) => r.objectiveLabel, (x) => esc(x), null)}
        ${metric("Spend", (r) => r.spend, money, null)}
        ${kpiRow}
        ${metric(`Change vs ${esc(v.compareLabel ?? "before")}`, (r) => r.change, (x) => (x == null ? "—" : signed(x)), null)}
        ${metric("Results", (r) => (r.mode === "cpm" ? null : r.results), n0, true)}
        ${metric(T("CTR"), (r) => r.ctr, (x) => pct(x, 2), true)}
        ${metric(T("CPC"), (r) => r.cpc, money, false)}
        ${metric(T("CPM"), (r) => r.cpm, money, false)}
        ${metric(T("Conversion rate"), (r) => r.cvr, (x) => pct(x, 1), true)}
        ${metric(T("Frequency"), (r) => r.frequency, n1, null)}
        ${metric("AdMate’s next step", (r) => r.label, (x) => esc(x ?? "—"), null)}
      </tbody></table></div>
      <p class="small-note">Green = best of the compared rows, red = weakest (only where higher or lower is clearly better).</p>
      ${same ? overlayChart(series, v.from, v.to) : ""}
    </div></article></div>`;
}

// ---------- Audiences & creatives ----------
function creativesHtml(v) {
  const sets = v.levels.ad_group.filter((s) => v.levels.ad.filter((a) => a.adSetId === s.id).length >= 2).sort((a, b) => b.spend - a.spend);
  if (!sets.length) return emptyState("No ad sets with two or more ads", "Creatives are compared within an ad set, where they share the same audience and budget.");
  // Same rule as the engine: ads are compared with their siblings only when the
  // siblings have at least 10 results between them.
  const vsSiblings = (a, sib) => {
    const others = sib.filter((x) => x.id !== a.id);
    if (others.reduce((s, x) => s + x.results, 0) < 10) return `<span class="muted" title="The other ads in this ad set have fewer than 10 results, so AdMate compares this ad with its own past instead.">too few results</span>`;
    const spend = others.reduce((s, x) => s + x.spend, 0);
    const val = a.mode === "roas" ? others.reduce((s, x) => s + x.revenue, 0) / (spend || 1) : others.reduce((s, x) => s + x.results, 0) > 0 ? spend / others.reduce((s, x) => s + x.results, 0) : null;
    if (val == null || a.kpi == null || val <= 0) return "—";
    const idx = higher(a.mode) ? a.kpi / val : val / a.kpi;
    return `<span class="delta ${idx >= 1.1 ? "good" : idx <= 0.9 ? "bad" : "flat"}">${idx >= 1 ? `${Math.round((idx - 1) * 100)}% better` : `${Math.round((1 - idx) * 100)}% worse`}</span>`;
  };
  return `${v.reuse.length ? `<div class="card pad" style="display:grid;gap:8px"><span>${src("read")} <b style="font-weight:500">Ads worth copying</b></span><ul style="margin:0;padding-left:18px;display:grid;gap:4px">${v.reuse.map((r) => `<li><button class="link" type="button" data-key="${esc(r.key)}">${esc(r.name)}</button> <span class="small-note">(${esc(r.where)})</span>: ${esc(r.why)}</li>`).join("")}</ul></div>` : ""}
  <div class="tablewrap"><table class="tbl" style="min-width:820px"><thead><tr><th>Ad</th><th class="r">Spend</th><th class="r">Main result</th><th class="r">vs others in its ad set</th><th class="r">${T("CTR")}</th><th class="r">${T("Conversion rate")}</th><th>AdMate’s call</th></tr></thead><tbody>
  ${sets.slice(0, 12).map((s) => { const ads = v.levels.ad.filter((a) => a.adSetId === s.id).sort((a, b) => b.spend - a.spend); return `<tr class="grouphead"><td colspan="7"><span class="lvl">Ad set</span> ${esc(s.name)} <span class="small-note">· in ${esc(s.campaignName)}</span></td></tr>${ads.map((a) => `<tr class="click" data-row="ad:${esc(a.id)}"><td><div class="nm">${esc(a.name.split(" · ").pop())}</div></td><td class="r num">${money(a.spend)}</td><td class="r num">${T(a.kpiShort)} ${kpi(a.kpi, a.mode)}</td><td class="r">${vsSiblings(a, ads)}</td><td class="r num">${pct(a.ctr, 2)}</td><td class="r num">${pct(a.cvr, 1)}</td><td>${a.stance === "scale" || a.stance === "cut" ? `<b style="font-weight:500">${esc(a.label)}</b>` : esc(a.label ?? "")}${a.yardKind && a.yardKind !== "others" ? `<div class="small-note">${a.yardKind === "target" || a.yardKind === "break_even" ? "vs your target" : "vs its own past"}</div>` : a.yardKind === "others" ? '<div class="small-note">vs the other ads</div>' : ""}</td></tr>`).join("")}`; }).join("")}
  </tbody></table></div>
  <p class="small-note">Ads are only compared with the other ads in the same ad set: they share its audience and budget, like a creative test.</p>`;
}
function intAudCreatives() {
  const v = V();
  return `<section class="section">
    <div class="tabs" role="tablist" aria-label="Audiences or creatives">${[["audiences", "Audiences"], ["creatives", "Creatives (ads)"]].map(([k, l]) => `<button type="button" role="tab" data-audtab="${k}" aria-selected="${ui.audTab === k}">${l}</button>`).join("")}</div>
    ${ui.audTab === "creatives" ? creativesHtml(v) : audienceHtml()}
  </section>`;
}
