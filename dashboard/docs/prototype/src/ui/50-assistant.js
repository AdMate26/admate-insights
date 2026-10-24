// AdMate Assistant: answers questions about the analysis on screen with real Claude,
// through the published page's `sample` capability (the viewer's own Claude account).
// It only gets AdMate's computed numbers and must not invent any; its style follows
// the user's view (plain for Beginner, precise for Advanced).
const asst = { open: false, turns: [], busy: false, ctl: null, about: null, live: "" };
let sampleFn; // undefined while loading, null when this view can't ask Claude
(async () => {
  try { sampleFn = window.claude?.use ? await window.claude.use("sample") : null; } catch { sampleFn = null; }
  renderAsst();
})();
function md(t) {
  return esc(t).split(/\n{2,}/).map((b) => {
    const lines = b.split("\n");
    const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (lines.every((l) => /^\s*[-*•] /.test(l))) return `<ul>${lines.map((l) => `<li>${bold(l.replace(/^\s*[-*•] /, ""))}</li>`).join("")}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)] /.test(l))) return `<ol>${lines.map((l) => `<li>${bold(l.replace(/^\s*\d+[.)] /, ""))}</li>`).join("")}</ol>`;
    return `<p>${bold(lines.join("<br>"))}</p>`;
  }).join("");
}
function asstChips() {
  const about = asst.about ? detailOf(asst.about) : current;
  if (about) {
    const short = about.title.length > 46 ? about.title.slice(0, 44) + "…" : about.title;
    return isBeg() ? [`Explain “${short}” simply`, "What exactly should I click?", "What happens if I ignore this?"] : [`Why is “${short}” ${about.priority} priority?`, "What exactly should I change in my ads manager?", "How sure is AdMate about this?", "What else could explain it?"];
  }
  const byPage = {
    home: ["Am I doing OK this week?", "What should I do first?", "What does “cost per result” mean?"],
    todo: ["Which of these should I do first?", "Can you explain the first one simply?"],
    myads: ["Which campaign is doing best?", "Which campaign is wasting money?"],
    overview: ["What changed most, and why?", "Which campaign should get more budget?", "Why did my costs go up?"],
    optimize: ["Which 3 should I do this week?", "Which one costs me the most money?", "What happens if I ignore these?"],
    campaigns: ["Which campaign should get more budget?", "Compare my two biggest campaigns"],
    audcre: ["Which audience should I test next?", "Which ad should I copy?"],
    portfolio: ["Which account needs me first?", "Summarise all accounts in 3 lines"],
    actions: ["What can I safely bulk-dismiss?", "Which items are driven by low data?"],
    explorer: ["Which ad sets are fatiguing?", "Where is spend not turning into results?"],
    budget: ["Where should I move budget, and why?", "Is any campaign under-funded?"],
    audience: ["Which group should I test next?", "Can I trust this audience data?"],
    alerts: ["Suggest 3 alert rules for this account"],
  }[view] ?? ["What should I do first?", "Am I doing OK this week?"];
  return byPage;
}
function renderAsst() {
  const root = $("#asstRoot");
  if (!root) return;
  if (!asst.open) { root.innerHTML = `<button class="asst-fab" type="button" data-asst-open aria-label="Open AdMate Assistant"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Ask AdMate</button>`; return; }
  const about = asst.about ? detailOf(asst.about) : current;
  const greet = { beginner: "Hi! Ask me anything about your ads, in your own words. I’ll explain it simply, using only your AdMate numbers.", intermediate: "Ask me about your results, a campaign, or any recommendation. I answer from your AdMate analysis.", advanced: "Ask about any metric, comparison or call. I’ll cite the comparison basis and confidence from your analysis." }[L()];
  const msgs = asst.turns.map((t) => t.role === "user" ? `<div class="bubble me">${esc(t.content)}</div>` : `<div class="bubble ai${t.role === "error" ? " err" : ""}">${md(t.content)}</div>`).join("");
  const unavailable = sampleFn === null ? `<div class="bubble ai err"><p>The Assistant uses Claude, so it only answers when this page is open inside Claude (claude.ai or the Claude app). Everything else on the page works here.</p></div>` : "";
  root.innerHTML = `<section class="asst" role="dialog" aria-label="AdMate Assistant">
    <header><div class="who"><b>AdMate Assistant</b><span>${src("ai")} ${XP[L()].name} style · only your AdMate numbers</span></div><button type="button" data-asst-new title="Start a new chat">New chat</button><button type="button" data-asst-close>Close ✕</button></header>
    <div class="msgs" id="asstMsgs">
      <div class="bubble ai"><p>${esc(greet)}</p></div>
      <span class="ctxchip">Looking at: <b>${esc(about ? about.title : `${TITLES[view] ?? ""} · ${view === "portfolio" ? "all accounts" : acctName()}`)}</b></span>
      ${unavailable}${msgs}
      ${asst.busy ? `<div class="bubble ai" id="asstLive">${asst.live ? md(asst.live) : '<span class="think">Thinking…</span>'}</div>` : ""}
      ${!asst.busy && sampleFn !== null ? `<div class="chips">${asstChips().map((c) => `<button type="button" data-asst-q="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
    </div>
    <form id="asstForm"><div class="row"><textarea id="asstIn" rows="1" placeholder="${sampleFn === null ? "Open this page in Claude to ask" : "Ask about your ads…"}" aria-label="Your question" ${sampleFn === null ? "disabled" : ""}></textarea>${asst.busy ? `<button class="btn" type="button" data-asst-stop>Stop</button>` : `<button class="btn primary" type="submit" ${sampleFn === null ? "disabled" : ""}>Send</button>`}</div>
      <span class="fine">Real Claude answers, on your Claude usage. Answers can be wrong: check them against the numbers. AdMate never changes your ad account.</span></form>
  </section>`;
  const m = $("#asstMsgs"); if (m) m.scrollTop = m.scrollHeight;
}
function asstData() {
  const v = V();
  const item = (d) => d && { title: d.title, where: d.where, type: d.bucket, priority: d.priority, whyThisPriority: d.priorityReason, confidence: d.confidence, confidenceWhy: d.confidenceText, whatHappened: d.description, likelyCause: (d.whyHappening ?? []).slice(0, 2), whatToDo: d.whatToDo, whatItCost: d.cost, moneyAtStake: d.impact?.known ? `${money(d.impact.amount)} ${d.impact.label}` : null, evidence: d.evidence, howJudged: (d.judgedBy ?? []).slice(0, 3), status: decided[d.key] ? STATUS_TEXT(decided[d.key]) : "open" };
  const base = {
    account: acctName(), pageOpen: TITLES[view], period: v.label, comparedWith: v.compareLabel ?? "nothing (no comparison)", olderHistory: v.history,
    totalSpend: money(v.spend), spendChange: v.spendChange == null ? null : signed(v.spendChange),
    goals: byGoalSpend(v).map((o) => { const g = goalOf(o); return { goal: o.label, measure: o.kpiLabel, value: kpi(o.value, o.mode), before: o.previous == null ? null : kpi(o.previous, o.mode), change: o.change == null ? null : signed(o.change), lowerIsBetter: !higher(o.mode), target: g.target == null ? null : kpi(g.target, o.mode), breakEven: g.breakEven == null ? null : kpi(g.breakEven, o.mode), verdict: (STATE[g.state] ?? [])[1], results: `${n0(o.results)} ${o.resultLabel}`, spend: money(o.spend), confidence: o.confidence, whatMovedIt: (o.drivers ?? []).map((d) => `${d.label} ${signed(d.change)} (${Math.round(d.weight * 100)}% of the change, ${d.helped ? "helped" : "hurt"})`) }; }),
    decisionsWaiting: decisions(v).slice(0, 8).map(item),
    doingGreat: v.great.slice(0, 4).map((g) => ({ campaign: g.campaign, result: g.kpi, why: g.why, suggestion: g.action })),
    campaigns: v.levels.campaign.map((h) => ({ name: h.name, platform: PLATFORM[h.platform], goal: h.objectiveLabel, spend: money(h.spend), shareOfSpend: pct(h.share), result: `${h.kpiShort} ${kpi(h.kpi, h.mode)}`, expected: h.expected == null ? null : kpi(h.expected, h.mode), change: h.change == null ? null : signed(h.change), ctr: pct(h.ctr, 2), cpm: money(h.cpm), frequency: n1(h.frequency), nextStep: h.label, priority: h.priority, state: KIND[h.kind]?.[0] ?? null })),
    itemTheUserIsLookingAt: item(asst.about ? detailOf(asst.about) : current),
  };
  if (view === "portfolio") base.allAccounts = ACCTS.map((a) => { const s = acctSummary(a.id); return { account: a.name, spend: money(s.v.spend), goalsOffTrack: s.off, openProblems: s.probs.length, highPriority: s.high.length, moneyAtStake: money(s.atStake), topProblem: s.top?.title ?? null }; });
  return base;
}
function asstRules() {
  const style = {
    beginner: "The user is a BEGINNER: a small-business owner new to ads. Use everyday words and no jargon; if a term is unavoidable (ad set, cost per result), explain it in a few words. Start with the direct answer. Under 120 words, at most 3 steps.",
    intermediate: "The user knows the basics of running ads. Common terms (CPL, CTR, ROAS, ad set) are fine; explain each briefly the first time. Explain causes using the drivers in DATA (whatMovedIt). Under 180 words.",
    advanced: "The user is an experienced media buyer, possibly managing several accounts. Be precise and compact: name the comparison basis (period, history, target, sibling ads), the drivers, the confidence, and caveats such as low volume or attribution delay. Under 220 words.",
  }[L()];
  return `You are AdMate Assistant, the helper inside AdMate, an app that analyses a business's ad reports (Meta, TikTok, Google Ads, LinkedIn) and says what to do next.
Answer the user's question about THEIR analysis using ONLY the DATA below (computed by AdMate's engine from their uploaded reports).
Rules:
- Every number you write must appear in DATA, or be simple arithmetic on DATA numbers. Never invent numbers, campaigns, dates, benchmarks or industry averages. If DATA doesn't contain what's needed, say so plainly and say where in AdMate to look, or which report to upload.
- AdMate never changes the ad account; the user makes changes in their ads manager. Never say a change was made.
- Likely causes are hypotheses: say "likely" or "probably", never certain. Never promise results or forecast them.
- Your advice must agree with AdMate's own nextStep / whatToDo. You may explain, order or simplify them; if you suggest something else, say it's an extra idea.
- Only help with the user's ads and AdMate. For anything else, say briefly that you can only help with their AdMate analysis.
- Reply in the language the user writes in.
- Format: short paragraphs; "- " bullets or "1. " steps for lists; **bold** sparingly; no tables or headings.
${style}

DATA:
${JSON.stringify(asstData())}`;
}
const ASST_ERR = {
  not_granted: "This page isn’t allowed to use Claude, so the Assistant can’t answer. Reload the page to be asked again.",
  sampling_disabled: "Claude isn’t available for this account.",
  rate_limited: "That’s a lot of questions in a short time. Please try again in a little while.",
  session_expired: "Your Claude session expired. Sign in again, then ask.",
  refused: "I can’t answer that one. Try asking about your campaigns, results or recommendations.",
  prompt_too_large: "That was too much to read at once. Try a shorter question or start a new chat.",
};
async function asstSend(q) {
  q = String(q ?? "").trim();
  if (!q || asst.busy || !sampleFn) return;
  asst.turns.push({ role: "user", content: q });
  asst.busy = true; asst.live = "";
  renderAsst();
  const ctl = new AbortController(); asst.ctl = ctl;
  const history = asst.turns.filter((t) => t.role !== "error").slice(-10);
  try {
    const { text, truncated } = await sampleFn([{ role: "user", content: asstRules() }, ...history], {
      cache: false, signal: ctl.signal,
      onText: ({ text }) => { asst.live = text; const el = $("#asstLive"); if (el) { el.innerHTML = md(text); const m = $("#asstMsgs"); if (m) m.scrollTop = m.scrollHeight; } },
    });
    asst.turns.push({ role: "assistant", content: text + (truncated ? "\n\n(Cut short. Ask for less at a time.)" : "") });
  } catch (e) {
    if (e?.text) asst.turns.push({ role: "assistant", content: e.text + (e.code === "cancelled" ? "\n\n(Stopped.)" : "") });
    if (e?.code !== "cancelled") asst.turns.push({ role: "error", content: ASST_ERR[e?.code] ?? "Something went wrong. Please try again." });
    if (e?.code === "not_granted" || e?.code === "sampling_disabled") sampleFn = null;
  } finally {
    asst.busy = false; asst.ctl = null; asst.live = "";
    renderAsst();
    $("#asstIn")?.focus();
  }
}
