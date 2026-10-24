// Pages shared by several views: Audience insight, Reports, Upload report,
// Goals & settings and Add an ad account.

// ---------- Audience insight (Intermediate tab, Advanced page) ----------
const BD = { age_gender: "Age & gender", location: "Location", placement: "Placement", device: "Device", weekday: "Day of week", hour: "Time of day" };
const HOWTO = {
  age_gender: ["Meta: Ads Manager → Breakdown → By delivery → Age and gender → Export.", "TikTok: Reporting → Custom report → dimensions Age and Gender.", "Google Ads: Insights and reports → Demographics (age, gender) → Download."],
  location: ["Meta: Breakdown → By delivery → Region (or Country / DMA).", "TikTok: Custom report → dimension Province / City.", "Google Ads: Insights and reports → When and where ads showed → Locations."],
  placement: ["Meta: Breakdown → By delivery → Placement (or Platform).", "TikTok: Custom report → dimension Placement.", "Google Ads: Placements report (Display and Video)."],
  device: ["Meta: Breakdown → By delivery → Impression device.", "Google Ads: Segment → Device.", "TikTok: Custom report → dimension Device / OS."],
  weekday: ["Uses your normal daily export: nothing extra to upload."],
  hour: ["Meta: Breakdown → By delivery → Time of day (ad account time zone). Meta can’t combine this with age, gender or location.", "Google Ads: Insights and reports → When and where ads showed → Day and hour.", "TikTok: Custom report → dimension Hour."],
};
function audAdvice(bd, r, a, kind) {
  const cost = `${a.kpiShort} ${kpi(r.cost, a.mode)} vs ${kpi(a.avg, a.mode)} on average`;
  const share = `${pct(r.resultShare)} of ${a.resultLabel} on ${pct(r.spendShare)} of the spend (${cost})`;
  const n = r.name.toLowerCase();
  const T2 = {
    best: { age_gender: `Make an ad with a message and visuals for ${n} and give it its own ad set, or use the people in this group who converted to seed a lookalike audience. Try it in one ad set before moving budget.`, location: `Keep ${r.name} in every campaign; test a separate ad set with an offer or language made for it.`, placement: `Make creative in ${r.name}'s format (e.g. vertical 9:16 video for Reels) so the platform can use it more.`, device: `Make sure the landing page is fast and easy on ${n}; that’s where results come from.`, weekday: `Plan launches, offers and new creative for ${r.name}s, and avoid big changes the day before.`, hour: `Reply to messages quickly around ${r.name}, and schedule posts and boosts for these hours.` },
    costly: { age_gender: `Exclude ${n} (or narrow the age range) in one ad set for a week, and compare it with the others.`, location: `Exclude ${r.name}, or lower the budget there, in one ad set first.`, placement: `Turn off ${r.name} in placements (Advantage+ placements → manual placements) and watch cost per result for a week.`, device: `Check the landing page and form on ${n}: slow or broken pages often cause this.`, weekday: `Lower spend on ${r.name}s only if this repeats over several weeks; weekday patterns change.`, hour: `Spend less at ${r.name}: Google Ads ad schedule can do this; Meta only allows it with a lifetime budget.` },
  };
  return { head: kind === "best" ? `${r.name}: best value` : `${r.name}: costly`, text: `${r.name} brought ${share}.`, todo: T2[kind][bd] };
}
function audienceHtml() {
  const t = E.audienceTargets(params(), acct);
  if (!t.objectives.length) return emptyState("No spend in this period", "Pick another period above.");
  if (!ui.aud.target || (ui.aud.target.startsWith("obj:") && !t.objectives.some((o) => `obj:${o.objective}` === ui.aud.target))) {
    const enough = t.objectives.find((o) => o.objective !== "awareness" && (E.audience(params(), `obj:${o.objective}`, "weekday", acct)?.results ?? 0) >= 200);
    ui.aud.target = `obj:${(enough ?? t.objectives[0]).objective}`;
  }
  const bd = ui.aud.breakdown;
  const a = E.audience(params(), ui.aud.target, bd, acct);
  const opts = t.objectives.map((o) => `<optgroup label="${esc(o.label)}"><option value="obj:${o.objective}" ${ui.aud.target === `obj:${o.objective}` ? "selected" : ""}>All ${esc(o.label.toLowerCase())} campaigns</option>${t.campaigns.filter((c) => c.objective === o.objective).map((c) => `<option value="c:${c.id}" ${ui.aud.target === `c:${c.id}` ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>`).join("");
  const controls = `<div class="aud-controls"><label class="toggle">Campaigns <select class="sel" id="audTarget" aria-label="Campaigns">${opts}</select></label><div class="filters" role="group" aria-label="Breakdown">${Object.entries(BD).map(([k, n]) => `<button type="button" data-bd="${k}" aria-pressed="${k === bd}">${n}</button>`).join("")}</div></div>`;
  if (!a) return controls + emptyState("No data", "Pick other campaigns.");
  const howto = `<details class="small"><summary>How to get this from your own account</summary><ul>${HOWTO[bd].map((s) => `<li>${esc(s)}</li>`).join("")}<li>Upload it under Upload report; AdMate links it to your campaigns by name.</li></ul></details>`;
  if (a.unavailable) return `${controls}<div class="empty"><b>No ${esc(BD[bd].toLowerCase())} export for this account yet</b>Export a breakdown from your ads manager and upload it under Upload report. Day of week works now: it uses your normal daily export.</div>${howto}`;
  const best = a.rows.filter((r) => r.verdict === "best").sort((x, y) => y.index - x.index).slice(0, 2);
  const costly = a.rows.filter((r) => r.verdict === "costly").sort((x, y) => x.index - y.index).slice(0, 2);
  const maxShare = Math.max(...a.rows.map((r) => Math.max(r.spendShare, r.resultShare)), 0.01);
  const VCH = { best: "Best value", costly: "Costly", average: "As expected", small: "Too little data" };
  const adv = isAdv();
  const segRows = a.rows.map((r) => `<div class="segrow">
      <span><b style="font-weight:500">${esc(r.name)}</b><br><span class="small-note">${n0(r.results)} ${esc(a.resultLabel)} · ${money(r.spend)}${adv && r.index != null ? ` · index ${r.index.toFixed(2)} · z ${r.z.toFixed(1)}` : ""}</span></span>
      <span class="segbars"><div><span>Spend</span><span class="track"><i class="sp" style="width:${(r.spendShare / maxShare) * 100}%"></i></span><span class="num">${pct(r.spendShare)}</span></div><div><span>${esc(a.resultLabel.split(" ")[0])}</span><span class="track"><i class="rs" style="width:${(r.resultShare / maxShare) * 100}%"></i></span><span class="num">${pct(r.resultShare)}</span></div></span>
      <span class="num">${esc(a.kpiShort)} ${kpi(r.cost, a.mode)}</span>
      <span><span class="vchip ${r.verdict}">${VCH[r.verdict]}</span></span>
    </div>`).join("");
  let visual = "";
  if (bd === "age_gender") {
    const ages = ["18–24", "25–34", "35–44", "45–54", "55+"];
    const color = (r) => { if (!r || r.index == null) return "var(--surface-2)"; const k = Math.max(-1, Math.min(1, Math.log(r.index) / Math.log(2))); return k >= 0 ? `color-mix(in srgb, var(--good) ${Math.round(15 + 70 * k)}%, var(--bg))` : `color-mix(in srgb, var(--hi) ${Math.round(15 + 70 * -k)}%, var(--bg))`; };
    visual = `<div class="chartbox"><span class="title">Cost per result by age and gender</span><div class="heat"><div class="hrowx" style="grid-template-columns:70px repeat(${ages.length},1fr)"><span></span>${ages.map((x) => `<span class="small-note" style="text-align:center">${x}</span>`).join("")}</div>${["Women", "Men"].map((g) => `<div class="hrowx" style="grid-template-columns:70px repeat(${ages.length},1fr)"><span class="small-note">${g}</span>${ages.map((x) => { const r = g === "Men" && (x === "45–54" || x === "55+") ? a.rows.find((y) => y.name === "Men 45+") : a.rows.find((y) => y.name === `${g} ${x}`); return `<span class="cell" style="background:${color(r)}" title="${esc(r?.name ?? "")}">${r ? kpi(r.cost, a.mode) : "—"}</span>`; }).join("")}</div>`).join("")}</div><span class="cap">Green: cheaper than average · red: more expensive · men 45–54 and 55+ are one group in this sample.</span></div>`;
  } else if (bd === "hour" || bd === "weekday") {
    const maxR = Math.max(...a.rows.map((r) => r.results), 1);
    const top = a.rows.reduce((b, r) => (r.results > b.results ? r : b));
    const wide = bd === "weekday";
    const bw = wide ? 86 : 26, x0 = wide ? 30 : 12, w = wide ? 56 : 20;
    visual = `<div class="chartbox"><span class="title">${esc(a.resultLabel)} by ${wide ? "day of week (real data)" : "hour of day (ad account time zone)"}</span><svg viewBox="0 0 640 150" role="img" aria-label="${esc(a.resultLabel)} by ${wide ? "weekday" : "hour"}">${a.rows.map((r, i) => { const h = (r.results / maxR) * 100; const fill = wide ? (r === top ? "var(--violet)" : "var(--faint)") : r.verdict === "best" ? "var(--good)" : r.verdict === "costly" ? "var(--hi)" : "var(--faint)"; return `<rect x="${x0 + i * bw}" y="${118 - h}" width="${w}" height="${h}" rx="2" fill="${fill}"><title>${esc(r.name)}: ${n0(r.results)} ${esc(a.resultLabel)}, ${esc(a.kpiShort)} ${kpi(r.cost, a.mode)}</title></rect>${wide ? `<text x="${x0 + w / 2 + i * bw}" y="${112 - h}" text-anchor="middle" font-size="10" fill="var(--fg)">${n0(r.results)}</text><text x="${x0 + w / 2 + i * bw}" y="136" text-anchor="middle" font-size="10" fill="var(--muted)">${r.name.slice(0, 3)}</text>` : i % 3 === 0 ? `<text x="${x0 + w / 2 + i * bw}" y="132" text-anchor="middle" font-size="9.5" fill="var(--muted)">${r.name.slice(0, 2)}h</text>` : ""}`; }).join("")}</svg><span class="cap">${wide ? `Most ${esc(a.resultLabel)}: <b>${esc(top.name)}</b> (${pct(top.resultShare)} of the week).` : "Green: best-value hours · red: costly hours."}</span></div>`;
  }
  return `${controls}
    <div class="aud-basis"><span><b style="color:var(--fg);font-weight:500">${esc(a.objectiveLabel)}</b> · ${n0(a.results)} ${esc(a.resultLabel)} · ${money(a.spend)} · average ${esc(a.kpiShort)} ${kpi(a.avg, a.mode)}</span><span>${a.simulated ? `<span class="src ai" title="The sample has no breakdown export, so this split is simulated from its real totals. With your own breakdown export, this shows your real numbers.">Simulated sample split</span>` : src("data")} ${esc(a.basis)}</span></div>
    ${best.length || costly.length ? `<div class="insights">${[...best.map((r) => ["best", r]), ...costly.map((r) => ["costly", r])].map(([k, r]) => { const x = audAdvice(bd, r, a, k); return `<div class="icard ${k}"><span><span class="vchip ${k}">${k === "best" ? "Best value" : "Costly"}</span> ${src("read")}</span><b style="font-weight:500">${esc(x.head)}</b><p>${esc(x.text)}</p><p class="do"><b style="font-weight:500;color:var(--fg)">Test next:</b> ${esc(x.todo)}</p></div>`; }).join("")}</div>` : `<p class="empty">No group stands out clearly: every group gets about the results you’d expect for its share of spend.</p>`}
    ${visual}
    <div class="segs"><div class="segrow head"><span class="label">Group</span><span class="label">Share of spend vs share of ${esc(a.resultLabel)}</span><span class="label">Cost</span><span class="label">Verdict</span></div>${segRows}</div>
    <p class="caution">Ad platforms already shift delivery toward the people who respond, so a “best value” group may simply be where the platform is doing well. Test changes in one ad set first. A group is only called best or costly when the difference is statistically clear.</p>
    ${howto}`;
}

// ---------- Reports ----------
function reportsHtml() {
  const reps = M().reports;
  return `<section class="section">
    ${sectionHead("Reports", `${plural(reps.length, "report")} uploaded for this account`, `<button class="btn primary" type="button" data-go="upload">Upload report</button>`)}
    <div class="list">${reps.map((r, i) => `<div class="li"><div class="grow"><b>${esc(r.fileName)}</b><span>${PLATFORM[r.platform]} · ${range(r.from, r.to)} · daily rows · ${n0(r.rows)} rows</span></div><button class="btn small" type="button" data-openreport="${i}">Open this report</button></div>`).join("")}</div>
    <p class="small-note">“Open” shows everything in the report with no comparison. In the app you can also compare a report with the one before it, or undo an upload.</p>
  </section>`;
}

// ---------- Upload report ----------
const GUIDES = [
  ["Meta Ads Manager", ["Open Ads Manager → Campaigns (or Ad sets / Ads for more detail) and pick the date range.", "Breakdown → By time → Day (recommended: unlocks trends, day-by-day and tracking checks).", "Keep the Results, Result indicator, Amount spent, Impressions, Reach and Link clicks columns.", "Reports → Export table data → .xlsx or .csv.", "For Audience insight: export again with Breakdown → By delivery → Age and gender (or Region, Placement, Impression device)."]],
  ["TikTok Ads Manager", ["Campaign tab → choose the date range.", "Custom columns: Cost, Impressions, Reach, Clicks (destination), Conversions, Video views, Paid follows.", "Export → .xlsx. For daily data, use Reporting → Custom report with the Day dimension."]],
  ["Google Ads", ["Campaigns → set the date range.", "Segment → Time → Day.", "Download → .csv or Excel."]],
  ["LinkedIn Campaign Manager", ["Analyze → Campaign performance.", "Time breakdown → Daily.", "Export → .csv."]],
];
function uploadHtml() {
  const g = isBeg() ? GUIDES.slice(0, 1) : GUIDES;
  return `<div class="uploadgrid">
      <div class="card"><div class="pad" style="display:grid;gap:12px"><h2 style="font-size:18px">Add an export from your ads manager</h2><p class="muted">AdMate reads CSV or XLSX exports from Meta, TikTok, Google Ads and LinkedIn. It shows the platform and columns it found before anything is saved.</p>
        <div class="drop"><b>Uploading is switched off in this prototype</b><p class="small-note">In the app you’d choose a file here (up to 4 MB), check what AdMate detected, then import it. Your first upload on a sample account creates your own account, so the sample stays as it is.</p></div></div></div>
      <aside class="guides"><h2 style="font-size:17px">How to export</h2>${g.map(([n, steps], i) => `<details ${i === 0 ? "open" : ""}><summary>${n}</summary><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></details>`).join("")}
        <p class="small-note">Your reports are stored in AdMate’s database and only your account can see them. They are never used to train AI models.</p></aside>
    </div>`;
}

// ---------- Goals & settings ----------
function settingsHtml() {
  const t = Object.values(targetsFor());
  return `<form class="card formcard" id="targetsForm" novalidate>
      <header><div><h2 style="font-size:18px">Goals</h2><p>The most you want to pay per result (or the return you need). Leave one empty and AdMate compares that goal with the period before. Saved targets re-judge your goals everywhere.</p></div>
        <span class="state flat num">${t.filter((x) => x.target > 0).length} of ${t.length} set</span></header>
      ${t.map((x) => {
        const be = breakEven(x), roas = x.mode === "roas";
        return `<div class="trow"><div class="who"><b>${esc(x.label)}</b><span>Judged by ${esc(x.kpiLabel)}</span></div>
          <div class="fields">
            <label class="field"><span>${roas ? "Target ROAS" : x.mode === "cpm" ? "Target cost per 1,000 people reached" : `Target ${esc(x.kpiLabel.toLowerCase())}`}</span><span class="in">${roas ? "" : "<i>USD</i>"}<input id="t-${x.objective}" data-o="${x.objective}" data-f="target" inputmode="decimal" placeholder="Optional" value="${x.target ?? ""}">${roas ? "<i>×</i>" : ""}</span></label>
            ${x.objective === "sales" ? `<label class="field"><span>Gross margin</span><span class="in"><input id="m-${x.objective}" data-o="${x.objective}" data-f="marginPct" inputmode="decimal" placeholder="e.g. 40" value="${x.marginPct ?? ""}"><i>%</i></span></label>` : ""}
            ${x.objective === "leads" || x.objective === "messages" ? `<label class="field"><span>Out of 100 ${x.objective === "leads" ? "leads" : "conversations"}, how many buy?</span><span class="in"><input id="c-${x.objective}" data-o="${x.objective}" data-f="closePct" inputmode="decimal" placeholder="e.g. 10" value="${x.closePct ?? ""}"><i>%</i></span></label>
              <label class="field"><span>Profit from one customer</span><span class="in"><i>USD</i><input id="p-${x.objective}" data-o="${x.objective}" data-f="profit" inputmode="decimal" placeholder="e.g. 20" value="${x.profit ?? ""}"></span></label>` : ""}
            ${x.mode === "cpm" ? `<p class="note">With daily reports AdMate judges awareness by cost per 1,000 impressions (reach can't be added up across days), so this target is used for period reports.</p>` : ""}
            <p class="be" id="be-${x.objective}" ${be == null ? "hidden" : ""}>Break-even: <b>${be == null ? "" : roas ? `ROAS ${be.toFixed(2)}×` : `${esc(x.kpiShort)} ${money(be)}`}</b>. Worse than this loses money.</p>
          </div></div>`;
      }).join("")}
      <div class="formfoot"><span>Saved in this prototype until you close the page.</span><button class="btn primary" type="submit">Save goals</button></div>
    </form>`;
}

// ---------- Add an ad account ----------
function addAccountHtml() {
  return `<form class="card formcard" id="addForm" style="max-width:560px" novalidate>
      <header><div><span class="label">Step 1 of 2</span><h2 style="font-size:20px;margin-top:4px">Add your ad account</h2><p>The business or brand you run ads for. Next, you’d upload an export from your ads manager.</p></div></header>
      <div class="pad" style="display:grid;gap:12px">
        <label class="field"><span>Business or brand name</span><span class="in"><input id="newName" placeholder="e.g. Lotus Skincare" style="font-family:var(--font-display)"></span></label>
        <div class="fields">
          <label class="field"><span>Industry</span><span class="in"><select id="newInd"><option value="">Choose…</option><option>Beauty &amp; retail</option><option>E-commerce</option><option>Local services</option><option>B2B</option></select></span></label>
          <label class="field"><span>Country</span><span class="in"><select id="newCountry"><option value="">Choose…</option><option>Cambodia</option><option>Thailand</option><option>Vietnam</option><option>Other</option></select></span></label>
        </div>
        <p class="small-note" id="addError" role="alert"></p>
      </div>
      <div class="formfoot"><span>In this prototype only the sample accounts exist.</span><button class="btn primary" type="submit">Continue to upload</button></div>
    </form>`;
}
