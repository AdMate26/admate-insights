// Advanced · Budget and Alerts.

// ---------- Budget: where the money goes, goal by goal ----------
// Click a goal (Sales, Messages, …) and every campaign with that goal shows its
// spending: amount, share, per day, results, a daily spend chart and AdMate's call.
const CAT = ["var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)", "var(--cat6)", "var(--cat7)"];
const BUDGET_CALL = { scale: ["good", "Add budget"], cut: ["bad", "Spend less"], fix: ["warn", "Fix first, then add"], keep: ["flat", "Keep as is"], average: ["flat", "Keep as is"], learn: ["flat", "Too early to tell"], wait: ["flat", "Too early to tell"], watch: ["flat", "Watch"], reuse: ["flat", "Ended: reuse"], avoid: ["flat", "Ended: avoid"] };
function spendChart(rows, series, from, to) {
  const first = series.find(Boolean);
  if (!first || first.days.length < 2) return "";
  const dates = first.days.map((d) => d.date);
  const top = rows.slice(0, 6), rest = rows.slice(6);
  const spendOn = (r, i) => series[rows.indexOf(r)]?.days[i]?.spend ?? 0;
  const byDay = dates.map((date, i) => ({ date, parts: [...top.map((r) => spendOn(r, i)), ...(rest.length ? [rest.reduce((s, r) => s + spendOn(r, i), 0)] : [])] }));
  const names = [...top.map((r) => r.name), ...(rest.length ? [`${rest.length} other campaigns`] : [])];
  const max = Math.max(1, ...byDay.map((d) => d.parts.reduce((s, x) => s + x, 0))) * 1.12;
  const W = 640, H = 200, L0 = 52, R = 8, T0 = 12, B = 26;
  const bw = (W - L0 - R) / byDay.length;
  const y = (val) => H - B - (val / max) * (H - T0 - B);
  const i0 = dates.findIndex((d) => d >= from), i1 = dates.length - 1 - [...dates].reverse().findIndex((d) => d <= to);
  const bars = byDay.map((d, i) => { let acc = 0; return d.parts.map((x, k) => { const y1 = y(acc + x), h = y(acc) - y1; acc += x; return h > 0.2 ? `<rect x="${(L0 + i * bw + bw * 0.12).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${h.toFixed(1)}" fill="${CAT[k % CAT.length]}"><title>${fmtDay(d.date)} · ${esc(names[k])}: ${money(x)}</title></rect>` : ""; }).join(""); }).join("");
  const step = Math.max(1, Math.ceil(byDay.length / 7));
  return `<div class="chartbox"><span class="title">Daily spending, by campaign <span class="small-note">(last 4 weeks; hover a bar for the amount)</span></span><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily spend by campaign">
    ${i0 >= 0 ? `<rect x="${L0 + i0 * bw}" y="${T0 - 6}" width="${(i1 - i0 + 1) * bw}" height="${H - T0 - B + 6}" fill="var(--violet-soft)"/>` : ""}
    ${[0, max / 2, max].map((val) => `<line x1="${L0}" x2="${W - R}" y1="${y(val)}" y2="${y(val)}" stroke="var(--line)" stroke-width="0.8"/><text x="${L0 - 6}" y="${y(val) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${money(val)}</text>`).join("")}
    ${bars}
    ${dates.map((d, i) => (i % step === 0 || i === dates.length - 1 ? `<text x="${L0 + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${fmtDate(d)}</text>` : "")).join("")}
  </svg><div class="legend">${names.map((n, k) => `<span><i class="sw" style="background:${CAT[k % CAT.length]}"></i>${esc(n)}</span>`).join("")}<span><i class="sw" style="background:var(--violet-soft)"></i>selected period</span></div></div>`;
}
function advBudget() {
  const v = V();
  const goals = byGoalSpend(v).filter((o) => v.levels.campaign.some((r) => r.objective === o.objective));
  if (!goals.length) return emptyState("No spend in this period", "Pick another period above.");
  if (!ui.budgetObj || !goals.some((o) => o.objective === ui.budgetObj)) ui.budgetObj = goals[0].objective;
  const total = goals.reduce((s, o) => s + o.spend, 0);
  const o = goals.find((g) => g.objective === ui.budgetObj);
  const rows = v.levels.campaign.filter((r) => r.objective === o.objective).sort((a, b) => b.spend - a.spend);
  const gSpend = rows.reduce((s, r) => s + r.spend, 0);
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
  const val = (r) => (r.mode === "roas" ? r.revenue : r.mode === "cpm" ? r.impressions : r.results);
  const totV = rows.reduce((s, r) => s + val(r), 0);
  const unit = o.mode === "roas" ? "sales value" : o.mode === "cpm" ? "impressions" : o.resultLabel;
  const series = rows.map((r) => E.daily("campaign", r.id, v.from, v.to, acct));
  const grp = (st) => rows.filter((r) => st.includes(r.stance));
  const li = (list, none) => (list.length ? `<ul>${list.map((r) => `<li><button class="link" type="button" data-entity="campaign:${esc(r.id)}">${esc(r.name)}</button> <span class="small-note">· ${money(r.spend / v.days)}/day</span><div class="small-note">${esc(firstSentence(r.action ?? ""))}</div></li>`).join("")}</ul>` : `<p class="small-note">${none}</p>`);
  const [gc, gw] = STATE[goalOf(o).state] ?? ["flat", ""];
  return `
  <section class="section">
    ${sectionHead("Where your money goes", `${esc(v.label)} · ${money(total)} across ${plural(goals.length, "goal")}. Click a goal to see all its campaigns’ spending.`)}
    <div class="bstack" role="group" aria-label="Spend by goal">${goals.map((g, i) => `<button type="button" data-bobj="${g.objective}" aria-pressed="${g.objective === o.objective}" style="width:${(g.spend / total) * 100}%;background:${CAT[i % CAT.length]}" title="${esc(g.label)}: ${money(g.spend)} (${pct(g.spend / total)})" aria-label="${esc(g.label)}: ${money(g.spend)}"></button>`).join("")}</div>
    <div class="bcards">${goals.map((g, i) => { const n = v.levels.campaign.filter((r) => r.objective === g.objective).length; const [c2, w2] = STATE[goalOf(g).state] ?? ["flat", ""]; return `<button class="bcard" type="button" data-bobj="${g.objective}" aria-pressed="${g.objective === o.objective}"><span class="top"><i class="sw" style="background:${CAT[i % CAT.length]}"></i><b>${esc(g.label)}</b></span><span class="amt">${money(g.spend)}</span><span class="small-note">${pct(g.spend / total)} of all spend · ${plural(n, "campaign")}</span><span class="small-note">${esc(g.kpiShort)} ${kpi(g.value, g.mode)} <span class="state ${c2}">${w2}</span></span></button>`; }).join("")}</div>
  </section>
  <section class="section">
    ${sectionHead(`${esc(o.label)}: ${plural(rows.length, "campaign")}`, `${money(gSpend)} spent in ${esc(v.label)} · ${esc(o.kpiShort)} ${kpi(o.value, o.mode)} <span class="state ${gc}">${gw}</span> · click a campaign for its full analysis`)}
    <div class="brows">${rows.map((r, i) => { const [tone, word] = BUDGET_CALL[r.stance] ?? ["flat", r.label ?? "—"]; const ss = gSpend ? r.spend / gSpend : 0, rs = totV ? val(r) / totV : 0; return `<button class="brow" type="button" data-entity="campaign:${esc(r.id)}">
      <span><span class="nm"><i class="sw" style="background:${CAT[i % CAT.length]}"></i>${esc(r.name)}</span><span class="meta2">${plat(r.platform)}<span>${esc(ROLE[roles[r.id] ?? r.role])}</span></span></span>
      <span><span class="bar"><i style="width:${(r.spend / maxSpend) * 100}%;background:${CAT[i % CAT.length]}"></i></span><span class="meta2"><span><b class="num" style="color:var(--fg);font-weight:500">${money(r.spend)}</b> · ${pct(ss)} of ${esc(o.label.toLowerCase())} spend · ${money(r.spend / v.days)}/day</span><span>${r.mode === "cpm" ? `${n0(r.impressions)} impressions` : `${n0(r.results)} ${esc(r.resultLabel)}`} · ${esc(r.kpiShort)} ${kpi(r.kpi, r.mode)}</span><span>brings ${pct(rs)} of the ${esc(unit)}</span></span></span>
      <span class="call"><span class="tag ${tone}">${word}</span>${r.expected != null ? `<span class="small-note">expected ${kpi(r.expected, r.mode)}</span>` : ""}</span>
    </button>`; }).join("")}</div>
    ${spendChart(rows, series, v.from, v.to)}
  </section>
  <section class="section">
    ${sectionHead(`What to do with the ${esc(o.label.toLowerCase())} budget ${src("read")}`, "AdMate’s calls, looking back only. It never forecasts results.")}
    <div class="todo3">
      <div class="g"><span class="label">Add budget</span>${li(grp(["scale"]), "No campaign is clearly ready for more yet.")}</div>
      <div class="w"><span class="label">Fix first, then add</span>${li(grp(["fix"]), "Nothing needs fixing first.")}</div>
      <div class="b"><span class="label">Spend less</span>${li(grp(["cut"]), "Nothing clearly needs cutting.")}</div>
    </div>
    <p class="small-note">AdMate only says “add” or “spend less” when a change holds against older history, never on a single day. Raise budgets about 20% at a time and check again after 3–4 days.</p>
  </section>`;
}

// ---------- Alerts: 1) automatic alerts  2) your own KPI alerts ----------
// Your own KPI alerts: a metric, a limit and the campaigns it applies to.
const RULE_METRICS = {
  worse: { label: "Main result got worse by (%)", ops: ["by"], fmt: (x) => `${Math.round(x)}%` },
  kpi: { label: "Main result (cost per result or ROAS)", ops: ["above", "below"], needsScope: true, fmt: (x, r) => kpi(x, r.mode) },
  ctr: { label: "CTR (%)", ops: ["below", "above"], fmt: (x) => `${x.toFixed(2)}%` },
  cpm: { label: "CPM ($)", ops: ["above", "below"], fmt: (x) => money(x) },
  frequency: { label: "Frequency", ops: ["above", "below"], fmt: (x) => x.toFixed(1) },
  spend: { label: "Spend in the period ($)", ops: ["above", "below"], fmt: (x) => money(x) },
  results: { label: "Results in the period", ops: ["below", "above"], fmt: (x) => n0(x) },
};
const rulesKey = () => `admate-rules-${acct}`;
const rules = () => LS.json(rulesKey(), []);
const putRules = (list) => LS.put(rulesKey(), list);
function ruleValue(rule, r) {
  if (rule.metric === "worse") return r.change == null ? null : (higher(r.mode) ? -r.change : r.change) * 100;
  if (rule.metric === "kpi") return r.kpi;
  if (rule.metric === "ctr") return r.ctr == null ? null : r.ctr * 100;
  if (rule.metric === "results") return r.mode === "cpm" ? null : r.results;
  return r[rule.metric];
}
function scopeRows(rule, v) {
  if (rule.scope.startsWith("obj:")) return v.levels.campaign.filter((r) => r.objective === rule.scope.slice(4));
  if (rule.scope.startsWith("c:")) return v.levels.campaign.filter((r) => r.id === rule.scope.slice(2));
  return v.levels.campaign;
}
function alertsFired(v = V()) {
  const out = [];
  for (const rule of rules()) {
    if (!rule.on) continue;
    for (const r of scopeRows(rule, v)) {
      const x = ruleValue(rule, r);
      if (x == null) continue;
      if (rule.op === "below" ? x < rule.value : x > rule.value) out.push({ rule, r, x });
    }
  }
  return out;
}
const scopeLabel = (s, v) => (s === "all" ? "any campaign" : s.startsWith("obj:") ? `${M().allObjectives.find((o) => o.objective === s.slice(4))?.label ?? s} campaigns` : `“${v.levels.campaign.find((r) => r.id === s.slice(2))?.name ?? "a campaign"}”`);
const ruleText = (rule, v) =>
  rule.metric === "worse"
    ? `Main result more than ${rule.value}% worse than the comparison period · ${scopeLabel(rule.scope, v)}`
    : `${RULE_METRICS[rule.metric].label.replace(/ \(.*\)$/, "")} ${rule.op} ${rule.metric === "ctr" ? `${rule.value}%` : rule.metric === "cpm" || rule.metric === "spend" ? money(rule.value) : rule.value} · ${scopeLabel(rule.scope, v)}`;
const firedText = (f) => (f.rule.metric === "worse" ? `Main result ${Math.round(f.x)}% worse` : `${RULE_METRICS[f.rule.metric].label.replace(/ \(.*\)$/, "")}: ${RULE_METRICS[f.rule.metric].fmt(f.x, f.r)}`);
const AUTO = Object.entries(DETECTOR_NAME).filter(([k]) => k !== "plan");
function ruleTemplates(v) {
  const t = [{ name: "Main result 30%+ worse", rule: { metric: "worse", op: "by", value: 30, scope: "all" } }, { name: "Frequency above 3", rule: { metric: "frequency", op: "above", value: 3, scope: "all" } }, { name: "CTR below 0.8%", rule: { metric: "ctr", op: "below", value: 0.8, scope: "all" } }];
  const sales = M().targets.find((x) => x.objective === "sales");
  const be = sales ? breakEven(targetsFor()[sales.objective]) : null;
  if (be && v.levels.campaign.some((r) => r.objective === "sales")) t.push({ name: `ROAS below break-even (${be.toFixed(2)}×)`, rule: { metric: "kpi", op: "below", value: +be.toFixed(2), scope: "obj:sales" } });
  return t;
}

// Automatic alerts: AdMate compares every campaign with its own past (when it has
// past data) and with its target (its own target, or else the goal's target), as
// sensitive as the user chooses. Saved per account in this browser.
const AUTO_DEFAULT = { on: true, past: true, target: true, sens: "auto", pct: 20, good: false };
const autoKey = () => `admate-auto-${acct}`;
const autoCfg = () => ({ ...AUTO_DEFAULT, ...LS.json(autoKey(), {}) });
const putAuto = (patch) => LS.put(autoKey(), { ...autoCfg(), ...patch });
// A campaign's own target is kept with the unit it's judged by (cost per result, ROAS
// or CPM); the goal's target stands in only when it's in that same unit.
const ctKey = () => `admate-ctargets-${acct}`;
const ownTargets = () => LS.json(ctKey(), {});
const ownTarget = (r) => { const t = ownTargets()[r.id]; return t?.mode === r.mode && t.value > 0 ? t.value : null; };
const goalTarget = (r) => { const g = targetsFor()[r.objective]; return g?.mode === r.mode && g.target > 0 ? g.target : null; };
function campaignTarget(r) {
  const own = ownTarget(r), g = goalTarget(r);
  return own != null ? { value: own, own: true } : g != null ? { value: g, own: false } : null;
}
// Share by which a result is worse than a base (positive = worse, negative = better).
const worseBy = (val, base, mode) => (base > 0 && val != null ? (higher(mode) ? (base - val) / base : (val - base) / base) : null);
function autoAlerts(v = V()) {
  const cfg = autoCfg();
  if (!cfg.on) return [];
  const lim = cfg.sens === "pct" ? Math.max(0.01, cfg.pct / 100) : null;
  const out = [];
  for (const r of v.levels.campaign) {
    if (r.kpi == null) continue;
    const sure = r.confidence !== "low";
    const enough = r.mode === "cpm" ? r.impressions >= 1000 : r.results >= 10;
    if (cfg.past && r.kpiA != null && v.compareLabel) {
      const w = worseBy(r.kpi, r.kpiA, r.mode);
      // "AdMate decides": a change of 20% or more that the significance test backs up.
      const bad = lim != null ? w >= lim : w >= 0.2 && sure;
      const good = cfg.good && (lim != null ? -w >= lim : -w >= 0.2 && sure);
      if (bad || good) out.push({ r, basis: "past", base: r.kpiA, w, good: !bad, sure });
    }
    if (cfg.target) {
      const t = campaignTarget(r);
      if (t) {
        const w = worseBy(r.kpi, t.value, r.mode);
        // "AdMate decides": more than 10% off target, on at least 10 results.
        const bad = enough && (lim != null ? w >= lim : w > 0.1);
        const good = cfg.good && enough && (lim != null ? -w >= lim : -w > 0.1);
        if (bad || good) out.push({ r, basis: "target", base: t.value, own: t.own, w, good: !bad, sure });
      }
    }
  }
  return out.sort((a, b) => a.good - b.good || b.w - a.w);
}
function autoText(a, v) {
  const r = a.r, k = (x) => kpi(x, r.mode), p = Math.round(Math.abs(a.w) * 100);
  return a.basis === "past"
    ? `${r.kpiShort} ${k(r.kpi)} vs ${k(a.base)} in ${v.compareLabel}: ${p}% ${a.good ? "better" : "worse"}${a.sure ? "" : " (little data: an early sign)"}`
    : `${r.kpiShort} ${k(r.kpi)} vs ${a.own ? "its own target" : "the goal target"} ${k(a.base)}: ${p}% ${a.good ? "better" : "worse"}`;
}
const alertCount = (v = V()) => alertsFired(v).length + autoAlerts(v).filter((a) => !a.good).length;

// Telegram: where and when alerts go. Nothing is sent from this prototype.
const TG_DEFAULT = { on: false, user: "", when: "daily", time: "09:00", days: [1, 2, 3, 4, 5] };
const tgCfg = () => ({ ...TG_DEFAULT, ...LS.json("admate-telegram", {}) });
const putTg = (patch) => LS.put("admate-telegram", { ...tgCfg(), ...patch });
const DAYNAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function tgWhen(t = tgCfg()) {
  if (t.when === "now") return "right away, each time new data arrives";
  if (t.when === "daily") return `every day at ${t.time}`;
  const d = [1, 2, 3, 4, 5, 6, 0].filter((x) => t.days.includes(x)).map((x) => DAYNAME[x]);
  return d.length ? `every ${d.join(", ")} at ${t.time}` : "on no days yet (pick at least one)";
}
function tgMessage(v = V()) {
  const auto = autoAlerts(v), fired = alertsFired(v);
  const lines = [
    ...auto.map((a) => `${a.good ? "Good news" : "Alert"} · ${a.r.name}: ${autoText(a, v)}`),
    ...fired.map((f) => `Your alert · ${f.r.name}: ${firedText(f)}`),
  ];
  const head = `AdMate · ${acctName()} · ${v.label}`;
  if (!lines.length) return `${head}\nNo alerts: every campaign is within your settings.`;
  return `${head}\n${plural(lines.length, "alert")}:\n${lines.slice(0, 6).map((l) => `• ${l}`).join("\n")}${lines.length > 6 ? `\n…and ${lines.length - 6} more in AdMate.` : ""}\n\nOpen AdMate to see why and what to do.`;
}
function openTelegramPreview() {
  const t = tgCfg();
  $("#overlay").innerHTML = `<div class="scrim" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="tg-t"><article class="mbox" style="width:min(560px,100%)">
    <header><div><span class="label">Preview · not sent</span><h2 id="tg-t">Your Telegram message</h2></div><button class="btn" type="button" data-close>Close</button></header>
    <div class="mbody">
      <div class="tg"><span class="who">AdMate bot → ${esc(t.user || "@yourname")}</span><div class="msg">${esc(tgMessage())}</div><span class="time">${t.on ? `Sent ${esc(tgWhen(t))}` : "Telegram is switched off"}</span></div>
      <p class="small-note">Built from the alerts on screen right now: automatic alerts and your own KPI alerts for ${esc(acctName())}. In this prototype nothing is sent: sending needs the AdMate Telegram bot and a small server, which aren’t built yet.</p>
    </div></article></div>`;
}

function advAlerts() {
  const v = V();
  const cfg = autoCfg();
  const auto = autoAlerts(v);
  const fired = alertsFired(v);
  const t = tgCfg();
  const tab = ui.alertTab ?? "auto";
  const badN = auto.filter((a) => !a.good).length;
  return `
  <div class="statusbar">
    <button class="stat ${badN ? "hi" : ""}" type="button" data-alerttab="auto"><span class="num">${cfg.on ? auto.length : "Off"}</span> automatic ${auto.length === 1 ? "alert" : "alerts"}</button>
    <button class="stat ${fired.length ? "hi" : ""}" type="button" data-alerttab="own"><span class="num">${fired.length}</span> of your KPI alerts fired</button>
    <button class="stat" type="button" data-scrollto="send">Telegram: <b style="font-weight:500">${t.on ? esc(tgWhen(t)) : "off"}</b></button>
  </div>
  <div class="tabs" role="tablist" aria-label="Alert type">
    <button type="button" role="tab" data-alerttab="auto" aria-selected="${tab === "auto"}">Automatic alerts</button>
    <button type="button" role="tab" data-alerttab="own" aria-selected="${tab === "own"}">Your own KPI alerts</button>
  </div>
  ${tab === "auto" ? autoTab(v, cfg, auto) : ownTab(v, fired)}
  ${sendSection(t)}`;
}
function autoTab(v, cfg, auto) {
  const counts =Object.fromEntries(AUTO.map(([k]) => [k, allItems(v).filter((d) => d.detector === k).length]));
  const off = cfg.on ? "" : "disabled";
  return `<section class="section">
    <div class="card pad" style="display:grid;gap:12px">
      <label class="switch"><input type="checkbox" data-auto="on" ${cfg.on ? "checked" : ""}> Automatic alerts are ${cfg.on ? "on" : "off"}</label>
      <p class="small-note">AdMate checks every campaign each time new data arrives. You only choose what to compare with and how sensitive to be.</p>
      <div class="optrow"><span>Compare each campaign with</span><label><input type="checkbox" data-auto="past" ${cfg.past ? "checked" : ""} ${off}> its own past results <span class="small-note">(when it has some)</span></label><label><input type="checkbox" data-auto="target" ${cfg.target ? "checked" : ""} ${off}> its target</label></div>
      <div class="optrow"><span>Alert me when</span><label><input type="radio" name="sens" value="auto" data-auto="sens" ${cfg.sens === "auto" ? "checked" : ""} ${off}> AdMate is sure the change is real <span class="small-note">(recommended)</span></label><label><input type="radio" name="sens" value="pct" data-auto="sens" ${cfg.sens === "pct" ? "checked" : ""} ${off}> it’s more than</label><input class="inp" id="autoPct" type="number" min="1" max="300" step="1" value="${cfg.pct}" style="width:72px" aria-label="Percent worse" ${cfg.on && cfg.sens === "pct" ? "" : "disabled"}><span class="small-note">% worse</span></div>
      <div class="optrow"><span>Good news</span><label><input type="checkbox" data-auto="good" ${cfg.good ? "checked" : ""} ${off}> Also tell me when a campaign is clearly doing better</label></div>
    </div>
    ${sectionHead(`Found now <span class="num">${cfg.on ? auto.length : 0}</span>`, cfg.on ? `In ${esc(v.label)}${v.compareLabel ? `, against each campaign’s past (${esc(v.compareLabel)}) and target` : ". No comparison period, so only targets are checked."}` : "Automatic alerts are off.")}
    ${!cfg.on ? emptyState("Automatic alerts are off", "Switch them on above.") : auto.length ? `<div class="rows">${auto.map((a) => `<button class="irow ${a.good ? "low" : a.w > 0.3 ? "high" : "medium"}" type="button" data-entity="campaign:${esc(a.r.id)}"><span class="body"><span class="tags"><span class="basis ${a.basis}">vs ${a.basis === "past" ? "its past" : "its target"}</span>${a.good ? '<span class="tag good">Doing better</span>' : ""}${plat(a.r.platform)}</span><span class="t">${esc(a.r.name)}</span><span class="sub">${esc(autoText(a, v))}</span></span><span class="side-r"><span class="link small">Investigate →</span></span></button>`).join("")}</div>` : emptyState("Nothing to report", "Every campaign is within your settings for this period.")}
    ${sectionHead("Campaign targets", "Set a target when a campaign starts, in the same unit as its result. Leave it empty to use the goal’s target from Goals & settings.")}
    <div class="tablewrap"><table class="tbl dense" style="min-width:760px"><thead><tr><th>Campaign</th><th>Goal</th><th class="r">Result now</th><th class="r">Goal target</th><th>This campaign’s target</th><th>vs target</th></tr></thead><tbody>
      ${v.levels.campaign.map((r) => { const g = goalTarget(r), own = ownTarget(r), t = campaignTarget(r); const w = t ? worseBy(r.kpi, t.value, r.mode) : null; const st = w == null ? null : w > 0.3 ? ["bad", "Far off"] : w > 0.1 ? ["warn", "Off track"] : ["good", "On track"]; return `<tr><td><div class="nm">${esc(r.name)}</div></td><td class="small">${esc(r.objectiveLabel)}</td><td class="r num">${esc(r.kpiShort)} ${kpi(r.kpi, r.mode)}</td><td class="r num">${g != null ? kpi(g, r.mode) : "—"}</td><td><span style="display:inline-flex;align-items:center;gap:4px">${r.mode === "roas" ? "" : '<span class="small-note">$</span>'}<input class="inp" data-ctarget="${esc(r.id)}" data-ctmode="${r.mode}" inputmode="decimal" placeholder="${g ?? "none"}" value="${own ?? ""}" style="width:84px" aria-label="${esc(r.kpiShort)} target for ${esc(r.name)}">${r.mode === "roas" ? '<span class="small-note">×</span>' : ""}</span></td><td>${st ? `<span class="state ${st[0]}">${st[1]}</span>` : `<span class="small-note">${t ? "no results yet" : "no target"}</span>`}</td></tr>`; }).join("")}
    </tbody></table></div>
    <details class="small"><summary>What else AdMate checks automatically (${AUTO.length} checks)</summary>
      <div class="tablewrap" style="margin-top:8px"><table class="tbl dense"><thead><tr><th>Check</th><th class="r">Found in ${esc(v.label)}</th><th>Show in lists</th></tr></thead><tbody>
        ${AUTO.map(([k, name]) => `<tr><td>${esc(name)}</td><td class="r num">${counts[k]}</td><td><label class="toggle"><input type="checkbox" data-mute="${k}" ${muted.has(k) ? "" : "checked"}> ${muted.has(k) ? "Off" : "On"}</label></td></tr>`).join("")}
      </tbody></table></div>
    </details>
  </section>`;
}
function ownTab(v, fired) {
  const list = rules();
  const objs = [...new Set(v.levels.campaign.map((r) => r.objective))];
  return `<section class="section">
    <p class="small-note">Set your own limit on any number. AdMate checks it every time new data arrives.</p>
    <form class="card pad ruleform" id="ruleForm" novalidate>
      <select class="sel" id="rMetric" aria-label="Metric">${Object.entries(RULE_METRICS).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join("")}</select>
      <select class="sel" id="rOp" aria-label="Condition"><option value="by">is worse by more than</option><option value="above">is above</option><option value="below">is below</option></select>
      <input class="inp" id="rValue" inputmode="decimal" placeholder="Value" aria-label="Value" style="width:90px">
      <select class="sel" id="rScope" aria-label="Applies to"><option value="all">Any campaign</option>${objs.map((o) => `<option value="obj:${o}">${esc(M().allObjectives.find((x) => x.objective === o).label)} campaigns</option>`).join("")}${v.levels.campaign.map((r) => `<option value="c:${esc(r.id)}">${esc(r.name)}</option>`).join("")}</select>
      <button class="btn primary" type="submit">Add alert</button>
      <span class="small-note" id="rErr" role="alert"></span>
    </form>
    <div class="views"><span class="label">Start from a template</span>${ruleTemplates(v).map((t, i) => `<button class="v" type="button" data-rtemplate="${i}">${esc(t.name)}</button>`).join("")}</div>
    ${list.length ? `<div class="list">${list.map((rule) => { const n = fired.filter((f) => f.rule.id === rule.id).length; return `<div class="rule"><label class="toggle"><input type="checkbox" data-ruleon="${rule.id}" ${rule.on ? "checked" : ""}> On</label><span class="grow">${esc(ruleText(rule, v))}</span>${n ? `<span class="fired">${plural(n, "campaign")} now</span>` : '<span class="small-note">quiet</span>'}<button class="link small" type="button" data-ruledel="${rule.id}">Delete</button></div>`; }).join("")}</div>` : ""}
    ${sectionHead(`Fired now <span class="num">${fired.length}</span>`, `Checked against ${esc(v.label)}`)}
    ${fired.length ? `<div class="rows">${fired.map((f) => `<button class="irow high" type="button" data-entity="campaign:${esc(f.r.id)}"><span class="body"><span class="t">${esc(f.r.name)}</span><span class="sub"><span class="fired">${esc(firedText(f))}</span><span>alert: ${esc(ruleText(f.rule, v))}</span></span></span><span class="side-r"><span class="link small">Investigate →</span></span></button>`).join("")}</div>` : emptyState(list.length ? "None fired" : "No KPI alerts yet", list.length ? "Every campaign is inside your limits for this period." : "Add one above, or start from a template.")}
  </section>`;
}
function sendSection(t) {
  return `<section class="section" id="send">
    ${sectionHead("Send alerts", "Where and when you hear about automatic alerts and your own KPI alerts")}
    <div class="card pad" style="display:grid;gap:12px">
      <div class="optrow"><span>In AdMate</span><span class="small">Always on: alerts appear here and as a badge in the menu.</span></div>
      <label class="switch"><input type="checkbox" data-tg="on" ${t.on ? "checked" : ""}> Send to Telegram</label>
      ${t.on ? `
        <div class="optrow"><span>Telegram username</span><input class="inp" id="tgUser" placeholder="@yourname" value="${esc(t.user)}" style="width:200px" autocomplete="off" aria-label="Telegram username"></div>
        <div class="optrow"><span>When</span>${[["now", "Right away (when new data arrives)"], ["daily", "Every day"], ["days", "On the days I choose"]].map(([k, l]) => `<label><input type="radio" name="tgwhen" value="${k}" ${t.when === k ? "checked" : ""}> ${l}</label>`).join("")}</div>
        ${t.when === "days" ? `<div class="optrow"><span>Days</span><span class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" data-tgday="${d}" ${t.days.includes(d) ? "checked" : ""}>${DAYNAME[d]}</label>`).join("")}</span></div>` : ""}
        ${t.when !== "now" ? `<div class="optrow"><span>Time</span><input class="inp" type="time" id="tgTime" value="${esc(t.time)}" aria-label="Time"><span class="small-note">in your time zone</span></div>` : ""}
        <p class="small">AdMate would send ${esc(tgWhen(t))}${t.user ? ` to ${esc(t.user)}` : ""}.</p>` : ""}
      <div><button class="btn" type="button" data-tgpreview>Preview the Telegram message</button></div>
      <p class="warnbox">Prototype: nothing is sent. Sending needs the AdMate Telegram bot and a small server, which aren’t built yet. The preview shows exactly what would arrive.</p>
    </div>
  </section>`;
}
