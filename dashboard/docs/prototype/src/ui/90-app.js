// App shell: menus per view, page routing, interactions and start-up.

const IC = {
  home: '<rect x="2" y="2" width="5" height="6" rx="1"/><rect x="9" y="2" width="5" height="3.5" rx="1"/><rect x="9" y="7.5" width="5" height="6.5" rx="1"/><rect x="2" y="10" width="5" height="4" rx="1"/>',
  todo: '<path d="M2.5 4.5 4 6l2.5-2.5 M2.5 10.5 4 12l2.5-2.5 M8.5 5h5 M8.5 11h5"/>',
  myads: '<path d="M2.5 6.2v3.6h2.2L10 13V3L4.7 6.2Z M12.2 5.8c.8.6 1.2 1.3 1.2 2.2s-.4 1.6-1.2 2.2"/>',
  optimize: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.4"/><path d="M8 1v2.2 M8 12.8V15 M1 8h2.2 M12.8 8H15"/>',
  campaigns: '<path d="M2.5 4h11 M2.5 8h11 M2.5 12h11 M5 2.5v11"/>',
  audience: '<circle cx="6" cy="5.5" r="2.3"/><path d="M2 13.5c.6-2.4 2.1-3.6 4-3.6s3.4 1.2 4 3.6"/><path d="M10.5 3.5a2.2 2.2 0 0 1 0 4.2 M12 9.9c1.2.5 1.8 1.6 2.1 3.2"/>',
  portfolio: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  actions: '<path d="M8 1.8 14.2 8 8 14.2 1.8 8Z M8 5.5v3.2 M8 10.8v.1"/>',
  explorer: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12 M6 6v7.5 M10 6v7.5"/>',
  budget: '<circle cx="8" cy="8" r="6"/><path d="M8 2v6l4.3 4.2"/>',
  alerts: '<path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11Z M6.5 13.5a1.5 1.5 0 0 0 3 0"/>',
  reports: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6.2h11 M2.5 9.8h11 M6.2 6.2v7.3"/>',
  upload: '<path d="M8 12.5V3.5 M4.5 7 8 3.5 11.5 7 M3 13.5h10"/>',
  settings: '<path d="M2.5 4.5h11 M2.5 11.5h11"/><circle cx="5.5" cy="4.5" r="1.7"/><circle cx="10.5" cy="11.5" r="1.7"/>',
};
// Each view has its own menu, built around its job. Groups: [label, [[id, name, icon], …]].
const NAVS = {
  beginner: [[null, [["home", "Home", "home"], ["todo", "To-do", "todo"], ["myads", "My ads", "myads"]]], ["More", [["upload", "Upload report", "upload"], ["settings", "Goals & settings", "settings"]]]],
  intermediate: [[null, [["overview", "Overview", "home"], ["optimize", "Optimize", "optimize"], ["campaigns", "Campaigns", "campaigns"], ["audcre", "Audiences & creatives", "audience"]]], ["Data & settings", [["reports", "Reports", "reports"], ["upload", "Upload report", "upload"], ["settings", "Goals & settings", "settings"]]]],
  advanced: [["All accounts", [["portfolio", "Portfolio", "portfolio"]]], ["This account", [["overview", "Overview", "home"], ["actions", "Actions", "actions"], ["campaigns", "Campaigns", "campaigns"], ["explorer", "Explorer", "explorer"], ["budget", "Budget", "budget"], ["audience", "Audience", "audience"], ["alerts", "Alerts", "alerts"]]], ["Data & settings", [["reports", "Reports", "reports"], ["upload", "Upload report", "upload"], ["settings", "Goals & settings", "settings"]]]],
};
const HOME = { beginner: "home", intermediate: "overview", advanced: "portfolio" };
const pagesOf = (lv) => NAVS[lv].flatMap(([, items]) => items.map(([id]) => id));
// Where a page goes when the view changes, so switching keeps you on the same subject.
const EQUIV = {
  beginner: { overview: "home", optimize: "todo", actions: "todo", campaigns: "myads", explorer: "myads", budget: "myads", portfolio: "home", audcre: "home", audience: "home", alerts: "todo", reports: "home" },
  intermediate: { home: "overview", todo: "optimize", myads: "campaigns", actions: "optimize", explorer: "campaigns", budget: "campaigns", portfolio: "overview", audience: "audcre", alerts: "optimize" },
  advanced: { home: "overview", todo: "actions", myads: "campaigns", optimize: "actions", audcre: "audience" },
};
const TITLES = { home: "Home", todo: "Things to do", myads: "My ads", overview: "Overview", optimize: "Optimize", campaigns: "Campaigns", audcre: "Audiences & creatives", portfolio: "Portfolio", actions: "Actions", explorer: "Explorer", budget: "Budget", audience: "Audience insight", alerts: "Alerts", reports: "Reports", upload: "Upload report", settings: "Goals & settings", addaccount: "Add an ad account" };
const PAGES = {
  home: begHome, todo: begTodo, myads: begMyAds,
  overview: () => (isAdv() ? advOverview() : intOverview()), optimize: intOptimize, campaigns: intCampaigns, audcre: intAudCreatives,
  portfolio: advPortfolio, actions: advActions, explorer: advExplorer, budget: advBudget, audience: () => `<section class="section">${audienceHtml()}</section>`, alerts: advAlerts,
  reports: reportsHtml, upload: uploadHtml, settings: settingsHtml, addaccount: addAccountHtml,
};
const NO_PERIOD = new Set(["reports", "upload", "settings", "addaccount"]);

function renderNav() {
  const v = V();
  const badge = { todo: decisions(v).length, optimize: decisions(v).length, actions: decisions(v).length, alerts: isAdv() ? alertCount(v) : 0 };
  $("#nav").innerHTML = NAVS[L()].map(([grp, items]) => `${grp ? `<span class="grp">${grp}</span>` : ""}${items.map(([id, name, icon]) => `<button type="button" data-go="${id}" ${id === view ? 'aria-current="page"' : ""}><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[icon]}</svg><span>${name}</span>${badge[id] ? `<span class="count">${badge[id]}</span>` : id === "reports" ? `<span class="count soft">${M().reports.length}</span>` : ""}</button>`).join("")}`).join("");
}
let focusAfter = null; // keep the caret in a search box across re-renders
function render() {
  if (view !== "addaccount" && !pagesOf(L()).includes(view)) view = HOME[L()];
  renderSwitchers();
  renderNav();
  renderBanner();
  renderHead(TITLES[view], !NO_PERIOD.has(view));
  let html;
  try { html = PAGES[view](); } catch (err) { console.error(err); html = emptyState("This page couldn’t load", String(err?.message ?? err)); }
  $("#pages").innerHTML = `<div class="page">${html}</div>`;
  if (asst.open && !asst.busy) renderAsst();
  if (focusAfter) { const el = document.getElementById(focusAfter.id); if (el) { el.focus(); try { el.setSelectionRange(focusAfter.pos, focusAfter.pos); } catch {} } focusAfter = null; }
}
function go(p) { view = p; closeOverlay(); closePicker(); render(); window.scrollTo({ top: 0 }); }
function setXp(k) {
  const was = xp;
  xp = k;
  LS.set("admate-level", k);
  if (k !== "advanced" && sel.cmp === "pick" && !sel.b) Object.assign(sel, { cmp: "previous", b: null });
  openPop = null;
  closeOverlay();
  view = view == null || !was ? HOME[k] : EQUIV[k]?.[view] ?? view;
  render();
  window.scrollTo({ top: 0 });
  renderAsst();
  toast(`${XP[k].name} view · ${XP[k].job}. Same numbers, ${k === "beginner" ? "fewer and plainer" : k === "advanced" ? "every control" : "more analysis"}.`);
}
function openEntity(level, id) {
  const key = keyForEntity(level, id);
  const d = detailOf(key);
  if (d) openDrawer(d, { entity: { level, id } });
}
function resetAll() {
  for (const o of [decided, roles, objectiveOverride]) for (const k of Object.keys(o)) delete o[k];
  for (const k of Object.keys(targetsBy)) delete targetsBy[k];
  ui.expanded.clear(); ui.compare.clear(); ui.actSel.clear(); ui.ex.sel.clear();
  Object.assign(sel, { a: { from: addDays(END, -6), to: END, name: "Last 7 days" }, cmp: "previous", b: null });
  for (const a of ACCTS) { LS.put(`admate-rules-${a.id}`, []); LS.put(`admate-auto-${a.id}`, {}); LS.put(`admate-ctargets-${a.id}`, {}); }
  LS.put("admate-telegram", {});
  ui.alertTab = "auto";
  LS.put("admate-views", []); LS.put("admate-muted", []); muted = new Set();
  asst.turns = []; asst.about = null;
  toast("Prototype reset: no decisions, rules or saved views; original goals; last 7 days.");
  go(HOME[L()]);
}

// ---------- clicks ----------
document.addEventListener("click", (e) => {
  if (openPop && !e.target.closest(".pickwrap")) { openPop = null; renderSwitchers(); }
  if (ui.ex.colsOpen && !e.target.closest(".colpick")) { ui.ex.colsOpen = false; if (view === "explorer") render(); }
  if (e.target.matches("input, select, textarea, option")) return; // form controls are handled by "change"
  const t = e.target.closest("button, .scrim, tr[data-row], tr[data-key], tr[data-acctgo], tr[data-trend]");
  if (!t) { if (pk && !e.target.closest(".picker")) closePicker(); return; }
  if (t.id === "periodBtn") return pk ? closePicker() : openPicker();
  if (pk && t.closest(".picker")) {
    if (t.dataset.pkkind) { const [w, k] = t.dataset.pkkind.split(":"); pk[w === "a" ? "aKind" : "bKind"] = k; return drawPicker(); }
    if (t.dataset.pkpick) { const [w, i] = t.dataset.pkpick.split(":"); const c = choices(w === "a" ? pk.aKind : pk.bKind)[Number(i)]; pk[w] = { from: c.from, to: c.to, name: c.name }; return drawPicker(); }
    if (t.dataset.calday) { const [w, ds] = t.dataset.calday.split(":"); return calClick(w, ds); }
    if (t.dataset.calnav) { const [w, n] = t.dataset.calnav.split(":"); const c = pk.cal[w]; c.month = shiftMonth(c.month, Number(n)); return drawPicker(); }
    if (t.hasAttribute("data-pkcancel")) return closePicker();
    if (t.hasAttribute("data-pkapply")) {
      if (pk.aKind === "custom") readCustom("a");
      if (pk.cmp === "pick" && pk.bKind === "custom") readCustom("b");
      if (pk.cmp === "pick" && !pk.b) return toast("Choose the period to compare with first");
      if (pk.aKind === "custom" && !pk.a) return toast("Click a first and a last day on the calendar");
      Object.assign(sel, { a: pk.a, cmp: pk.cmp, b: pk.cmp === "pick" ? pk.b : null });
      closePicker(); render();
      const v = V();
      return toast(`Showing ${v.label}${v.compareLabel ? ` vs ${v.compareLabel}` : " with no comparison"}`);
    }
    return;
  }
  if (pk) closePicker();
  const d = t.dataset;
  if (t.matches("[data-close]")) return closeOverlay();
  if (d.pop) { openPop = openPop === d.pop ? null : d.pop; return renderSwitchers(); }
  if (d.xpSet) return setXp(d.xpSet);
  if (d.xpPick) return setXp(d.xpPick);
  if (t.hasAttribute("data-compare-views")) { openPop = null; renderSwitchers(); return openOnboard(true); }
  if (t.hasAttribute("data-onboard")) return openOnboard();
  if (d.acct) { setAccount(d.acct); return go(view === "portfolio" ? "overview" : view); }
  if (t.hasAttribute("data-home")) return go(HOME[L()]);
  if (d.go) { if (d.optf) ui.optFilter = d.optf; openPop = null; return go(d.go); }
  if (t.hasAttribute("data-reset")) return resetAll();
  if (t.hasAttribute("data-summary")) return openSummary();
  if (t.hasAttribute("data-copysummary")) { const text = V().summaryReport; return navigator.clipboard?.writeText(text).then(() => toast("Copied as text"), () => toast("Your browser blocked copying here.")); }
  if (d.explain) return toast(d.explain);
  // Beginner
  if (t.hasAttribute("data-begmoregoals")) { ui.begMoreGoals = !ui.begMoreGoals; return render(); }
  if (d.myads) { ui.myAdsFilter = d.myads; return render(); }
  if (d.decide) { decideKey(d.decide, d.kind, d.days); return render(); }
  if (d.undo) { decideKey(d.undo, "restore"); return render(); }
  if (d.deeper) { const it = detailOf(d.deeper); return openDrawer(it, { depth: "intermediate" }); }
  // Intermediate
  if (t.hasAttribute("data-moregoals")) { ui.moreGoals = !ui.moreGoals; return render(); }
  if (d.trend) { ui.trendObj = d.trend; return render(); }
  if (d.optf) { ui.optFilter = d.optf; return render(); }
  if (d.level) { ui.campLevel = d.level; return render(); }
  if (d.expand) { ui.expanded.has(d.expand) ? ui.expanded.delete(d.expand) : ui.expanded.add(d.expand); return render(); }
  if (t.hasAttribute("data-expandall")) { const v = V(); const camps = v.levels.campaign; const all = camps.every((c) => ui.expanded.has(c.id)); camps.forEach((c) => (all ? ui.expanded.delete(c.id) : ui.expanded.add(c.id))); return render(); }
  if (t.matches("[data-obj]")) { ui.objFilter = d.obj || null; return render(); }
  if (t.hasAttribute("data-compare")) return openCompare();
  if (t.hasAttribute("data-cmpclear")) { ui.compare.clear(); return render(); }
  if (d.audtab) { ui.audTab = d.audtab; return render(); }
  if (d.bd) { ui.aud.breakdown = d.bd; return render(); }
  // Advanced
  if (d.acctgo) { setAccount(d.acctgo); return go("overview"); }
  if (d.xkey) { const [id, ...k] = d.xkey.split("|"); setAccount(id); go("overview"); return openDrawer(detailOf(k.join("|"))); }
  if (d.actf) { ui.actFilter = d.actf; ui.actSel.clear(); return render(); }
  if (d.bulk) {
    if (d.bulk === "clear") { ui.actSel.clear(); return render(); }
    const keys = [...ui.actSel];
    for (const k of keys) decideKey(k, d.bulk, d.bulk === "remind" ? 3 : d.bulk === "dismissed" ? "Not relevant" : undefined, true);
    ui.actSel.clear();
    toast(`${plural(keys.length, "item")}: ${d.bulk === "done" ? "marked as action taken" : d.bulk === "remind" ? "reminder in 3 days" : d.bulk === "restore" ? "back on the list" : "dismissed"}`);
    return render();
  }
  if (d.xlevel) { Object.assign(ui.ex, { level: d.xlevel, active: null, group: d.xlevel === "campaign" && ui.ex.group === "campaign" ? "none" : ui.ex.group }); ui.ex.sel.clear(); return render(); }
  if (d.qview) { const q = QUICK_VIEWS[Number(d.qview)]; Object.assign(ui.ex, structuredClone(q.state), { active: `q${d.qview}`, q: "", obj: "", plat: "", prio: "all" }); ui.ex.sel.clear(); return render(); }
  if (d.sview) { const s = savedViews()[Number(d.sview)]; if (s) { Object.assign(ui.ex, structuredClone(s.state), { active: `s${d.sview}` }); ui.ex.sel.clear(); } return render(); }
  if (d.sdel) { const list = savedViews(); list.splice(Number(d.sdel), 1); LS.put("admate-views", list); ui.ex.active = null; return render(); }
  if (t.hasAttribute("data-cols")) { ui.ex.colsOpen = !ui.ex.colsOpen; return render(); }
  if (t.hasAttribute("data-colsreset")) { ui.ex.cols = [...DEFAULT_COLS]; return render(); }
  if (d.csv) return exportCsv(d.csv);
  if (t.hasAttribute("data-saveview")) {
    const name = ($("#xViewName")?.value ?? "").trim();
    if (!name) { toast("Give the view a name first"); return $("#xViewName")?.focus(); }
    const list = savedViews();
    const { level, group, cols, sort, q, obj, plat, prio, issues } = ui.ex;
    list.push({ name, state: { level, group, cols, sort, q, obj, plat, prio, issues } });
    LS.put("admate-views", list);
    ui.ex.active = `s${list.length - 1}`;
    toast(`View “${name}” saved in this browser`);
    return render();
  }
  if (d.sort) { const s = ui.ex.sort; ui.ex.sort = s.key === d.sort ? { key: d.sort, dir: -s.dir } : { key: d.sort, dir: COLS[d.sort]?.txt || d.sort === "name" ? 1 : -1 }; ui.ex.active = null; return render(); }
  if (d.xbulk) {
    const e2 = ui.ex;
    if (d.xbulk === "clear") { e2.sel.clear(); return render(); }
    const v = V();
    let n = 0;
    for (const id of e2.sel) { const r = v.levels[e2.level].find((x) => x.id === id); const key = r ? keyForEntity(r.level, r.id, v) : null; const it = key ? detailOf(key, v) : null; if (it && isOpen(it)) { decideKey(key, d.xbulk, d.xbulk === "remind" ? 3 : d.xbulk === "dismissed" ? "Not relevant" : undefined, true); n++; } }
    e2.sel.clear();
    toast(n ? `${plural(n, "open item")} updated` : "None of the selected rows had an open item");
    return render();
  }
  if (d.bobj) { ui.budgetObj = d.bobj; return render(); }
  if (d.alerttab) { ui.alertTab = d.alerttab; return render(); }
  if (t.hasAttribute("data-tgpreview")) return openTelegramPreview();
  if (d.scrollto) return document.getElementById(d.scrollto)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (d.rtemplate) { const tpl = ruleTemplates(V())[Number(d.rtemplate)]; putRules([...rules(), { id: Date.now().toString(36), on: true, ...tpl.rule }]); toast(`Rule added: ${tpl.name}`); return render(); }
  if (d.ruledel) { putRules(rules().filter((r) => r.id !== d.ruledel)); return render(); }
  if (d.openreport) { Object.assign(sel, { a: { from: MIN(), to: END, name: "Whole report" }, cmp: "none", b: null }); go(HOME[L()] === "portfolio" ? "overview" : HOME[L()]); return toast("Showing everything in this report, with no comparison"); }
  // Assistant
  if (t.hasAttribute("data-asst-open")) { asst.open = true; asst.about = current?.key ?? null; renderAsst(); return $("#asstIn")?.focus(); }
  if (t.hasAttribute("data-asst-close")) { asst.ctl?.abort(); asst.open = false; return renderAsst(); }
  if (t.hasAttribute("data-asst-new")) { asst.ctl?.abort(); asst.turns = []; asst.about = current?.key ?? null; return renderAsst(); }
  if (t.hasAttribute("data-asst-stop")) return asst.ctl?.abort();
  if (d.asstQ) return asstSend(d.asstQ);
  if (d.askabout) { asst.open = true; asst.about = d.askabout; renderAsst(); return $("#asstIn")?.focus(); }
  // Opening items
  if (d.act) return act(d.act, d.reason ?? d.days);
  if (d.key) return openDrawer(detailOf(d.key));
  if (d.entity) { const [lv, id] = d.entity.split(":"); return openEntity(lv, id); }
  if (t.matches("tr[data-row]")) { const [lv, id] = d.row.split(":"); return openEntity(lv, id); }
});

// ---------- form controls ----------
document.addEventListener("change", (e) => {
  const t = e.target, d = t.dataset;
  if (t.name === "pkcmp" && pk) { if (pk.aKind === "custom") readCustom("a"); pk.cmp = t.value; return drawPicker(); }
  if (t.id?.startsWith("pk-") && pk) return readCustom(t.id.split("-")[1]);
  if (t.id === "optSort") { ui.optSort = t.value; return render(); }
  if (t.id === "actPrio") { ui.actPrio = t.value; return render(); }
  if (t.id === "actSort") { ui.actSort = t.value; return render(); }
  if (d.asel) { t.checked ? ui.actSel.add(d.asel) : ui.actSel.delete(d.asel); return render(); }
  if (t.hasAttribute("data-asel-all")) { $$("[data-asel]").forEach((c) => (t.checked ? ui.actSel.add(c.dataset.asel) : ui.actSel.delete(c.dataset.asel))); return render(); }
  if (d.cmp) {
    if (t.checked && ui.compare.size >= 3) { t.checked = false; return toast("Compare up to 3 at a time"); }
    t.checked ? ui.compare.add(d.cmp) : ui.compare.delete(d.cmp);
    return render();
  }
  if (t.id === "xGroup") { ui.ex.group = t.value; ui.ex.active = null; return render(); }
  if (t.id === "xObj") { ui.ex.obj = t.value; ui.ex.active = null; return render(); }
  if (t.id === "xPlat") { ui.ex.plat = t.value; ui.ex.active = null; return render(); }
  if (t.id === "xPrio") { ui.ex.prio = t.value; ui.ex.active = null; return render(); }
  if (t.id === "xIssues") { ui.ex.issues = t.checked; ui.ex.active = null; return render(); }
  if (d.col) { const c = ui.ex.cols; if (t.checked) { if (!c.includes(d.col)) c.push(d.col); } else ui.ex.cols = c.filter((x) => x !== d.col); ui.ex.active = null; return render(); }
  if (d.xsel) { t.checked ? ui.ex.sel.add(d.xsel) : ui.ex.sel.delete(d.xsel); return render(); }
  if (t.hasAttribute("data-xsel-all")) { $$("[data-xsel]").forEach((c) => (t.checked ? ui.ex.sel.add(c.dataset.xsel) : ui.ex.sel.delete(c.dataset.xsel))); return render(); }
  if (d.ruleon) { putRules(rules().map((r) => (r.id === d.ruleon ? { ...r, on: t.checked } : r))); return render(); }
  if (d.mute) { t.checked ? muted.delete(d.mute) : muted.add(d.mute); LS.put("admate-muted", [...muted]); return render(); }
  if (d.auto) { putAuto(d.auto === "sens" ? { sens: t.value } : { [d.auto]: t.checked }); return render(); }
  if (t.id === "autoPct") { const n = Math.round(Number(t.value)); if (n >= 1 && n <= 300) putAuto({ pct: n }); else toast("Enter a percentage between 1 and 300"); return render(); }
  if (d.ctarget) {
    const all = ownTargets(); const n = parseFloat(String(t.value).replace(/[^\d.]/g, ""));
    if (n > 0) all[d.ctarget] = { value: n, mode: d.ctmode }; else delete all[d.ctarget];
    LS.put(ctKey(), all);
    const r = V().levels.campaign.find((x) => x.id === d.ctarget);
    toast(n > 0 ? "Campaign target saved" : r && goalTarget(r) != null ? "This campaign now uses the goal’s target" : "Campaign target removed");
    return render();
  }
  if (d.tg === "on") { putTg({ on: t.checked }); return render(); }
  if (t.name === "tgwhen") { putTg({ when: t.value }); return render(); }
  if (d.tgday) { const day = Number(d.tgday); const ds = new Set(tgCfg().days); t.checked ? ds.add(day) : ds.delete(day); putTg({ days: [...ds] }); return render(); }
  if (t.id === "tgTime") { putTg({ time: t.value || "09:00" }); return render(); }
  if (t.id === "tgUser") { const u = t.value.trim(); putTg({ user: u && !u.startsWith("@") ? "@" + u : u }); return render(); }
  if (t.id === "audTarget") { ui.aud.target = t.value; return render(); }
  if (t.id === "rMetric") { const op = $("#rOp"); if (t.value === "worse") op.value = "by"; else if (op.value === "by") op.value = "above"; return; }
  if (d.role) { roles[d.role] = t.value; return toast(`Funnel role set to ${ROLE[t.value]}. In the app AdMate then compares it only with ${ROLE[t.value].toLowerCase()} campaigns.`); }
  if (d.objsel) { objectiveOverride[d.objsel] = t.value; return toast(`Goal set to ${M().allObjectives.find((o) => o.objective === t.value).label}. In the app AdMate re-judges it with that goal’s result.`); }
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "actQ" || t.id === "xQ") {
    if (t.id === "actQ") ui.actQ = t.value; else { ui.ex.q = t.value; ui.ex.active = null; }
    focusAfter = { id: t.id, pos: t.selectionStart ?? t.value.length };
    return render();
  }
  const o = t.dataset.o;
  if (!o) return;
  const draft = { ...targetsFor()[o] };
  $$(`input[data-o="${o}"]`).forEach((i) => { const v = parseFloat(i.value); draft[i.dataset.f] = v > 0 ? v : null; });
  const be = breakEven(draft), p = $("#be-" + o);
  p.hidden = be == null;
  if (be != null) p.querySelector("b").textContent = draft.mode === "roas" ? `ROAS ${be.toFixed(2)}×` : `${draft.kpiShort} ${money(be)}`;
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "asstForm") return asstSend($("#asstIn").value);
  if (f.id === "targetsForm") {
    $$("#targetsForm input[data-o]").forEach((i) => { const v = parseFloat(i.value); targetsFor()[i.dataset.o][i.dataset.f] = v > 0 ? v : null; });
    toast("Goals saved. Every page re-judges them now.");
    return render();
  }
  if (f.id === "addForm") {
    const name = $("#newName").value.trim();
    if (!name) { $("#addError").textContent = "Enter your business or brand name first."; return $("#newName").focus(); }
    toast(`In the app, “${name}” would be created now. This prototype only has the sample accounts.`);
    return go("upload");
  }
  if (f.id === "ruleForm") {
    const metric = $("#rMetric").value, op = $("#rOp").value, value = parseFloat($("#rValue").value), scope = $("#rScope").value;
    const err = (m) => { $("#rErr").textContent = m; };
    if (!(value >= 0)) return err("Enter a number.");
    if (metric === "worse" && op !== "by") return err("Use “is worse by more than” for this one.");
    if (metric !== "worse" && op === "by") return err("Use “is above” or “is below”.");
    if (RULE_METRICS[metric].needsScope && scope === "all") return err("Pick a goal or a campaign: cost per result and ROAS can’t share one limit.");
    putRules([...rules(), { id: Date.now().toString(36), metric, op, value, scope, on: true }]);
    toast("Rule added");
    return render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.id === "asstIn" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return asstSend(e.target.value); }
  if (e.key === "Escape") {
    if ($(".onboard") && !xp) return;
    if (openPop) { openPop = null; return renderSwitchers(); }
    closeOverlay(); closePicker();
  }
  if (e.key === "Enter" && e.target.matches("tr[data-row], tr[data-acctgo], tr[data-trend], tr[data-key]")) e.target.click();
  // Advanced: "/" jumps to search.
  if (e.key === "/" && isAdv() && !e.target.matches("input, textarea, select")) { const s = $("#xQ") ?? $("#actQ"); if (s) { e.preventDefault(); s.focus(); } }
});

// ---------- start ----------
try {
  view = HOME[L()];
  render();
  renderAsst();
  if (!xp) openOnboard();
} catch (err) {
  console.error(err);
  $("#pages").innerHTML = `<div class="empty"><b>The AdMate engine couldn’t start in this browser</b>${esc(err.message)}</div>`;
}
