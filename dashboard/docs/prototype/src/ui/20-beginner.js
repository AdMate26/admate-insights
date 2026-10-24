// Beginner · Understand. One screen answers three questions: Are my ads OK? What's the
// biggest problem? What should I do next? Plain words, one simple chart, no filters
// or settings to learn. Going deeper stays plain; the full analysis is one link away.

const TONE = { far_off: "bad", worse: "bad", off_track: "warn", on_track: "good", better: "good", flat: "flat", unknown: "flat" };
const ICONCH = { good: "✓", warn: "!", bad: "✕", flat: "•" };
const periodWord = (v) => (v.days === 7 ? "week" : v.days === 1 ? "day" : `${v.days} days`);
// "the week before", or the period the user picked to compare with.
const beforeWords = (v) => (sel.cmp === "pick" && v.compareLabel ? v.compareLabel : `the ${periodWord(v)} before`);
// "in the last 7 days", "in October", "in Sep 20 – Oct 4".
const periodWords = (v) => {
  const n = sel.a.name;
  if (!n || n === range(sel.a.from, sel.a.to)) return `in ${v.label}`;
  if (/^(Last|This|The)\b/.test(n)) return `in ${n.replace(/^Last/, "the last").replace(/^This/, "this").replace(/^The/, "the")}`;
  return /^Whole/.test(n) ? `in ${n.toLowerCase().replace(/^whole/, "the whole")}` : `in ${n}`;
};

function plainValue(o, val) {
  if (o.mode === "roas") return `you got <b>$${val.toFixed(2)} back in sales for every $1</b> you spent`;
  if (o.mode === "cpm") return `showing your ads 1,000 times cost <b>${money(val)}</b>`;
  return `each ${esc(singular(o))} cost you <b>${money(val)}</b>`;
}
function plainGoal(o, v) {
  const g = goalOf(o);
  if (o.value == null) return { tone: "flat", text: `<b>${esc(o.label)}:</b> not enough results yet to judge.` };
  const k = (x) => (x == null ? "—" : o.mode === "roas" ? `$${x.toFixed(2)} back` : money(x));
  const before = beforeWords(v);
  const judge = {
    far_off: g.breakEven != null && (higher(o.mode) ? o.value < g.breakEven : o.value > g.breakEven) ? `Your goal is ${g.target != null ? k(g.target) : "better"}, so <b>you’re losing money</b> on these ads.` : `That’s far from your goal of ${k(g.target)}.`,
    off_track: `That’s a little worse than your goal of ${k(g.target)}.`,
    on_track: `Your goal is ${k(g.target)}, so <b>you’re on track</b>.`,
    better: `That’s better than ${before} (${k(o.previous)}).`,
    worse: `That’s worse than ${before} (${k(o.previous)}).`,
    flat: `About the same as ${before}.`,
    unknown: "",
  }[g.state] ?? "";
  return { tone: TONE[g.state] ?? "flat", text: `<b>${esc(o.label)}:</b> ${plainValue(o, o.value)}. ${judge}` };
}
function begStatus(v) {
  const main = byGoalSpend(v).slice(0, 3);
  const lines = main.map((o) => plainGoal(o, v));
  const probs = openProblems(v).filter((d) => d.priority === "high" || d.priority === "medium");
  const bad = lines.some((l) => l.tone === "bad") || probs.some((d) => d.priority === "high");
  const warn = bad || lines.some((l) => l.tone === "warn") || probs.length > 0;
  const tone = bad ? "bad" : warn ? "warn" : "good";
  const headline = tone === "bad" ? `Your ads need attention${probs.length ? `: ${plural(probs.length, "problem")} to fix` : ""}` : tone === "warn" ? "Mostly OK, with a few things to improve" : "Your ads are doing well";
  return { tone, headline, lines };
}
function moneyLine(d, v) {
  const i = d.impact;
  if (!i || !i.known || !(i.amount > 0)) return "";
  if (i.label === "saved") return ` It saved you about <b>${money(i.amount)}</b> compared with what AdMate expected.`;
  if (i.label === "extra revenue") return ` It brought about <b>${money(i.amount)}</b> more in sales than expected.`;
  return ` This cost you about <b>${money(i.amount)}</b> ${i.label === "lost revenue" ? "in lost sales" : "extra"}.`;
}
// One thing to do, with its steps and the buttons to tick it off.
function tcard(d, i, opts = {}) {
  const v = V();
  const dec = decided[d.key];
  const steps = stepsOf(d).slice(0, 3);
  const camp = String(d.where ?? "").split(" › ")[0];
  return `<div class="tcard ${d.priority}${dec ? " closed" : ""}${opts.big ? " big" : ""}"><span class="n" aria-hidden="true">${i + 1}</span>
    <span class="label" style="font-size:10.5px">${esc(PRIO_PLAIN[d.priority] ?? "")}${camp ? ` · ${esc(camp)}` : ""}</span>
    <span class="t">${esc(plain(d.title))}</span>
    <p class="why">${esc(plain(firstSentence(d.description)))}${moneyLine(d, v)}</p>
    ${steps.length ? `<div><span class="label" style="font-size:10.5px">How to do it</span><ol>${steps.map((s) => `<li>${esc(plain(s))}</li>`).join("")}</ol></div>` : ""}
    <div class="acts">${dec ? `<span class="small-note">${esc(STATUS_TEXT(dec))}</span><button class="btn small" type="button" data-undo="${esc(d.key)}">Undo</button>` : `<button class="btn primary small" type="button" data-decide="${esc(d.key)}" data-kind="done">I did this</button><button class="btn small" type="button" data-decide="${esc(d.key)}" data-kind="remind" data-days="1">Remind me tomorrow</button>`}
      <button class="link" type="button" data-key="${esc(d.key)}">Explain more</button>
      <button class="link" type="button" data-askabout="${esc(d.key)}">Ask the Assistant</button></div>
  </div>`;
}

function begHome() {
  const v = V();
  if (!v.objectives.length) return emptyState("No ad spend in this period", "Pick another period above, or upload a newer report.");
  const st = begStatus(v);
  const ch = v.spendChange;
  const spend = `You spent <b>${money(v.spend)}</b> ${esc(periodWords(v))}${ch == null || !v.compareLabel ? "" : Math.abs(ch) < 0.03 ? `, about the same as ${esc(beforeWords(v))}` : `, ${pct(Math.abs(ch))} ${ch > 0 ? "more" : "less"} than ${esc(beforeWords(v))}`}.`;
  const todo = decisions(v);
  const probs = todo.filter((d) => d.bucket === "problem");
  const top = probs[0] ?? null;
  const next = top ?? todo[0] ?? null;
  const great = v.great.filter((g) => !decided[g.key])[0];
  const others = byGoalSpend(v).slice(3);
  const chartGoal = byGoalSpend(v).find((o) => o.mode !== "cpm" && o.results > 0);
  const series = chartGoal ? { resultLabel: chartGoal.resultLabel, days: chartGoal.daily.map((d) => ({ date: d.date, results: d.results })) } : null;
  let takeaway = "";
  if (series) {
    const inP = series.days.filter((d) => d.date >= v.from && d.date <= v.to);
    const best = inP.length ? inP.reduce((b, d) => (d.results > b.results ? d : b)) : null;
    const wd = Array.from({ length: 7 }, () => ({ r: 0, n: 0 }));
    for (const d of series.days) { wd[D0(d.date).getUTCDay()].r += d.results; wd[D0(d.date).getUTCDay()].n++; }
    const bestWd = wd.map((x, i) => ({ i, avg: x.n ? x.r / x.n : 0 })).sort((p, q) => q.avg - p.avg)[0];
    takeaway = `${best && best.results > 0 ? `Your best day was <b>${fmtDay(best.date)}</b> with ${n0(best.results)} ${esc(chartGoal.resultLabel)}. ` : ""}Over the last 4 weeks, <b>${WEEKDAYS[bestWd.i]}</b> was usually your best day.`;
  }
  return `
  <section class="hero ${st.tone}" aria-labelledby="ok-h">
    <span class="label">Am I doing OK?</span>
    <h2 id="ok-h">${st.headline}</h2>
    <p class="say">${spend}</p>
    <ul class="plaingoals">${st.lines.map((g) => `<li><span class="ico ${g.tone}" aria-hidden="true">${ICONCH[g.tone]}</span><span>${g.text}</span></li>`).join("")}
      ${ui.begMoreGoals ? others.map((o) => plainGoal(o, v)).map((g) => `<li><span class="ico ${g.tone}" aria-hidden="true">${ICONCH[g.tone]}</span><span>${g.text}</span></li>`).join("") : ""}</ul>
    ${others.length ? `<p><button class="link" type="button" data-begmoregoals>${ui.begMoreGoals ? "Show only my main goals" : `Show my ${plural(others.length, "smaller goal")}`}</button></p>` : ""}
  </section>
  <section class="section" aria-labelledby="bp-h">
    ${sectionHead(top ? "Fix this first" : "Your next step", top ? "The most urgent problem, and how to fix it step by step" : "No problems found. Here’s the best thing to do next.")}
    ${next ? tcard(next, 0, { big: true }) : emptyState("Nothing needs doing right now", "AdMate checks again after your next upload.")}
    ${todo.length > 1 ? `<p><button class="link" type="button" data-go="todo">${plural(todo.length - 1, "more thing")} to do →</button></p>` : ""}
  </section>
  ${great ? `<section class="section" aria-labelledby="gw-h">${sectionHead("What’s working", "")}<div class="gcard"><span class="tag good">Doing great</span><span class="t">${esc(great.campaign)}</span><p>${esc(plain(firstSentence(great.why)))}</p><p class="do"><b style="font-weight:500">You could:</b> ${esc(plain(firstSentence(great.action)))}</p><div><button class="btn small" type="button" data-key="${esc(great.key)}">Explain more</button></div></div></section>` : ""}
  ${series ? `<section class="section" aria-labelledby="ch-h">${sectionHead(`Your ${esc(chartGoal.resultLabel)} per day`, `${esc(chartGoal.label)}, last 4 weeks`)}<div class="chartbox">${simpleBars(series, v.from, v.to)}<p class="cap">${takeaway}</p></div></section>` : ""}
  <details class="more"><summary>Words you’ll see in AdMate</summary><div class="words">
    <div><b>Cost per result</b>What one result (a message, a lead, a sale) cost you in ads, on average. Lower is better.</div>
    <div><b>Sales per $1 spent (ROAS)</b>How much you sold for each $1 of ads. Higher is better.</div>
    <div><b>Click rate (CTR)</b>Out of everyone who saw your ad, the share who clicked it.</div>
    <div><b>Goal</b>The cost (or return) you’re aiming for. Set it in Goals &amp; settings.</div>
  </div></details>`;
}

function begTodo() {
  const v = V();
  const list = decisions(v);
  const done = [...allItems(v), ...Object.values(v.details)].filter((d, i, arr) => decided[d.key] && arr.findIndex((x) => x.key === d.key) === i);
  const watching = v.signals.filter(isOpen).length + [...v.problems, ...v.opportunities].filter((d) => isOpen(d) && shown(d) && d.priority === "low").length;
  return `<section class="section">
    ${sectionHead("Things to do", "Most important first, with the steps. Tick them off as you go.")}
    ${list.length ? `<div class="grid" style="display:grid;gap:12px">${list.map((d, i) => tcard(d, i)).join("")}</div>` : emptyState("You’re all done for now", "AdMate checks again after your next upload.")}
    ${watching ? `<p class="small-note">AdMate is also keeping an eye on ${plural(watching, "smaller thing")}. Nothing to do about them yet.</p>` : ""}
  </section>
  ${done.length ? `<section class="section">${sectionHead(`Done and reminders (${done.length})`, "AdMate checks whether each change worked after your next upload.")}<div class="rows">${done.map((d) => `<div class="irow closed ${d.priority}"><span class="body"><span class="t">${esc(plain(d.title))}</span><span class="sub">${esc(STATUS_TEXT(decided[d.key]))}</span></span><span class="side-r"><button class="btn small" type="button" data-undo="${esc(d.key)}">Undo</button></span></div>`).join("")}</div></section>` : ""}`;
}

const CAMP_TAG = { issue: ["bad", "Needs attention"], opportunity: ["good", "Doing great"], on_track: ["good", "On track"], learning: ["flat", "Too early to tell"], waiting: ["flat", "Too early to tell"], signal: ["flat", "Keep an eye on it"] };
const campGroup = (r) => (r.kind === "issue" ? "attention" : r.kind === "opportunity" || r.kind === "on_track" ? "well" : "early");
function begMyAds() {
  const v = V();
  const rows = [...v.levels.campaign].sort((a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9) || b.spend - a.spend);
  if (!rows.length) return emptyState("No campaign spent money in this period", "Pick another period above.");
  const count = (g) => rows.filter((r) => campGroup(r) === g).length;
  const f = ui.myAdsFilter;
  const list = f === "all" ? rows : rows.filter((r) => campGroup(r) === f);
  return `<section class="section">
    ${sectionHead("My ads", `${esc(v.label)} · tap a campaign to see what to do`)}
    <div class="filters" role="group" aria-label="Show">${[["all", `All (${rows.length})`], ["attention", `Needs attention (${count("attention")})`], ["well", `Doing well (${count("well")})`], ["early", `Too early to tell (${count("early")})`]].map(([k, l]) => `<button type="button" data-myads="${k}" aria-pressed="${k === f}">${l}</button>`).join("")}</div>
    ${list.length ? `<div class="grid3">${list.map((r) => {
      const [tone, word] = CAMP_TAG[r.kind] ?? ["flat", "No verdict yet"];
      const each = r.kpi == null ? "no results yet" : r.mode === "roas" ? `$${r.kpi.toFixed(2)} back in sales for every $1` : r.mode === "cpm" ? `${money(r.kpi)} per 1,000 views` : `${money(r.kpi)} per ${esc(singular(r))}`;
      const exp = r.expected != null ? `AdMate expected about ${r.mode === "roas" ? `$${r.expected.toFixed(2)} back` : money(r.expected)}.` : "";
      return `<button class="ccard" type="button" data-entity="campaign:${esc(r.id)}"><span class="tag ${tone}">${word}</span><span class="t">${esc(r.name)}</span>
        <p>${r.mode === "cpm" ? "" : `${n0(r.results)} ${esc(r.resultLabel)} · `}${each}</p>
        ${exp ? `<p class="small-note">${exp}</p>` : ""}
        <p class="small-note">Spent ${money(r.spend)} · ${pct(r.share)} of your ad budget · ${PLATFORM[r.platform]}</p>
        ${r.label ? `<p><b style="font-weight:500">Next:</b> ${esc(plain(r.label))}</p>` : ""}</button>`;
    }).join("")}</div>` : emptyState("Nothing here", "No campaign in this group for this period.")}
  </section>`;
}
