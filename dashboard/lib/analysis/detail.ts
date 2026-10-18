import { money, num, pct } from "../format";
import { kpiAvailable, MEASURE_LABEL } from "../metrics/availability";
import type { Measures } from "../metrics/measures";
import { kpiLabel, kpiShort, OBJECTIVE_DEFS, RESULT_MEASURES, resultCount, type KpiMode, type Objective } from "../metrics/objectives";
import { PLATFORM_LABEL, type Platform } from "../ingest/headers";
import { LEVEL_WORD } from "./compare";
import { decompose, type Driver } from "./decompose";
import { DRIVER_ACTION } from "./detectors";

// For campaigns that have ended: what to change before running the setup again.
const NEXT_FLIGHT: Record<Driver["key"], string> = {
  cpm: "Next time, try a broader audience or other placements — this one was expensive to reach.",
  ctr: "Next time, use a new creative or hook — people clicked less on this one.",
  rate: "Next time, use a new creative or message — fewer people responded to this one.",
  cvr: "Before running it again, check the landing page, form or offer — clicks turned into results less often.",
  frequency: "Next time, use a bigger audience — this one showed the ads to the same people too often.",
  aov: "Next time, feature higher-value products or bundles — orders were smaller.",
};
import { advantage } from "./wording";
import { performanceIndex } from "./goals";

// What a "watch" card would become once the change is confirmed.
const PENDING_WORDS: Record<"scale" | "cut" | "reuse" | "avoid", string> = {
  scale: "put more money in",
  cut: "cut or fix",
  reuse: "reuse this setup next time",
  avoid: "don't repeat this setup as is",
};
import type { Plan } from "./plan";
import type { Analysis, CampaignRow, Evidence, Finding, FindingStatus } from "./types";
import type { Confidence } from "./stats";

// The detailed performance description shown for every campaign (and every
// detected problem): what happened, why it might be happening, what to do, what
// to watch afterwards, what the report can't tell, how confident AdMate is, and
// how it reached the judgement. Built only from engine numbers.

export interface Detail {
  key: string;
  priority: "high" | "medium" | "low" | "monitor";
  kind: "issue" | "opportunity" | "on_track" | "learning" | "waiting" | "signal";
  isNew: boolean;
  ended: boolean;
  title: string;
  where: string | null; // "MM-Grow Follower-28 July" or "Campaign › ad set › ad"
  whereLabel: string; // "Campaign", "Ad", "Whole account"
  platform: Platform | null;
  description: string;
  tiles: { label: string; value: string; sub?: string }[];
  whyHappening: string[];
  whatToDo: string[];
  monitor: string[];
  cantTell: string[];
  risk: string | null;
  // Why it has this priority (how much it matters), as opposed to confidence (how sure AdMate is).
  priorityReason: string;
  // What the change cost, as a worked sum from real numbers (null when not computable).
  cost: string | null;
  // Small note on how AdMate judges a campaign that has no past results yet.
  note: string | null;
  confidence: Confidence;
  confidenceText: string;
  judgedBy: string[];
  evidence: Evidence[];
  status: FindingStatus;
  dismissReason: string | null;
  askQuestion: string;
}

type Row = CampaignRow;

const fk = (v: number | null, mode: KpiMode, cur: string) => (v === null ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v, cur));

const OBJECTIVE_SOURCE: Record<string, string> = {
  result_type: "taken from the result type in your export",
  platform_objective: "taken from the campaign objective in your export",
  name: "guessed from the campaign name — check it on the Campaigns page",
  metrics: "guessed from the results it produced — check it on the Campaigns page",
  default: "no objective was found, so it was assumed — please check it on the Campaigns page",
  user: "set by you",
};

function kpiFormula(o: Objective, mode: KpiMode): string {
  const def = OBJECTIVE_DEFS[o];
  if (mode === "roas") return "revenue ÷ spend (higher is better)";
  if (mode === "cpm") return "spend ÷ impressions × 1,000 (reach can't be used for this report, so AdMate uses impressions)";
  if (def.perThousand) return "spend ÷ people reached × 1,000 (lower is better)";
  return `spend ÷ ${def.resultLabel} (lower is better)`;
}

function driverValue(d: Driver, cur: string): [string, string] {
  if (d.key === "cpm" || d.key === "aov") return [money(d.b, cur), money(d.a, cur)];
  if (d.key === "frequency") return [d.b.toFixed(2), d.a.toFixed(2)];
  return [pct(d.b), pct(d.a)];
}

// Possible explanations from the KPI breakdown: this item (mine) vs a comparison
// (theirs). Each driver that pushed the KPI the way it went becomes one line.
function driverHypotheses(o: Objective, mode: KpiMode, mine: Measures, theirs: Measures, better: boolean, theirName: string, cur: string): string[] {
  const d = decompose(o, mode, theirs, mine);
  if (!d) return [];
  const res = OBJECTIVE_DEFS[o].resultLabel;
  const out: string[] = [];
  for (const x of [...d.drivers].sort((p, q) => q.weight - p.weight)) {
    if (!Number.isFinite(x.change) || Math.abs(x.change) < 0.05 || x.helped !== better) continue;
    const [m, t] = driverValue(x, cur);
    const vs = `${m} vs ${t} for ${theirName}`;
    const up = x.change > 0;
    const line: Record<Driver["key"], string> = {
      cpm: up
        ? `Ads cost more to show here: CPM ${vs}. The audience may be narrower or more competitive, or the placements more expensive.`
        : `Ads are cheaper to show here: CPM ${vs}. The audience or placements are cheaper to reach.`,
      ctr: up ? `More people click: CTR ${vs}. The creative or message works well for this audience.` : `Fewer people click: CTR ${vs}. The creative or message may not stand out to this audience.`,
      cvr: up
        ? `More clicks turn into ${res}: conversion rate ${vs}. The landing page, form or offer works well.`
        : `Fewer clicks turn into ${res}: conversion rate ${vs}. The landing page, form or offer may lose people after the click — or tracking may miss some ${res}.`,
      rate: up ? `More people respond per impression: ${vs}. The creative prompts people to act.` : `Fewer people respond per impression: ${vs}. The creative may not prompt people to act, or the audience is less interested.`,
      frequency: up
        ? `The same people see the ads more often: frequency ${vs}. The audience may be too small, so new reach gets expensive.`
        : `The ads reach more new people: frequency ${vs}.`,
      aov: up ? `Orders are bigger: ${vs} per order.` : `Orders are smaller: ${vs} per order.`,
    };
    out.push(line[x.key]);
    if (out.length >= 3) break;
  }
  return out;
}

// What the uploaded data can't show — so the user knows the limits of the judgement.
function limitations(a: Analysis, r: Row | null, o: Objective): string[] {
  const out: string[] = [];
  const def = OBJECTIVE_DEFS[o];
  if (!a.hasComparisonData && !r?.history) out.push("There is no earlier period in this view, so AdMate can't tell whether this is getting better or worse over time. Upload or select an earlier report to see the trend.");
  if (r && !r.availB.has("reach")) out.push("Reach and frequency can't be used for this report (not in the export, or not addable across days/ads), so audience saturation can't be assessed.");
  if (!a.coverage.hasDaily) out.push("This report has totals for the whole period, not daily rows, so changes within the period — and the learning phase — can't be seen.");
  if (r && !r.availB.has("linkClicks")) out.push("Link clicks aren't in this report, so the click-through and conversion rates can't be separated.");
  if (o === "sales" && r && !r.availB.has("conversionValue")) out.push("There's no revenue column, so profitability (ROAS) can't be judged — only cost per purchase.");
  if (def.postClick) out.push(`${def.resultLabel.charAt(0).toUpperCase() + def.resultLabel.slice(1)} are as the platform reports them (its attribution window); sales or leads it didn't track aren't included.`);
  if (!a.goals.some((g) => g.objective === o && (g.target || g.profitPerCustomer || g.marginPct))) out.push(`No target is set for ${def.label.toLowerCase()}, so "expected" means your other campaigns or the earlier period — not your business goal.`);
  return out.slice(0, 3);
}

function confidenceText(conf: Confidence, results: number, resultLabel: string, stance?: Plan["stance"]): string {
  if (stance === "learn") return "Low — the platform is still learning, so results aren't stable yet.";
  if (conf === "high") return `High — based on ${num(results, true)} ${resultLabel}, enough for the difference to be real rather than chance.`;
  if (conf === "medium") return `Medium — ${num(results, true)} ${resultLabel}: enough to act on, but check again after the next report.`;
  return results === 0 ? `Low — no ${resultLabel} yet, so there's nothing to judge the cost against.` : `Low — only ${num(results, true)} ${resultLabel} in this report; at least 10 are needed to judge fairly.`;
}

function clicksOf(m: Measures): number {
  return m.linkClicks > 0 ? m.linkClicks : m.clicksAll;
}

// ---------------- campaign plan → detail ----------------
export function planDetail(a: Analysis, p: Plan): Detail {
  const cur = a.workspace.currency;
  const r = p.row;
  const o = r.info.objective;
  const def = OBJECTIVE_DEFS[o];
  const short = kpiShort(o, r.mode);
  const results = resultCount(r.b, o);
  const hasResults = kpiAvailable(o, r.mode, r.availB);
  const clicks = clicksOf(r.b);
  const clicksKnown = r.availB.has("linkClicks") || r.availB.has("clicksAll");
  const word = LEVEL_WORD[r.level].one;
  const isAd = r.level === "ad"; // ads are judged against the other ads in their ad set, and have no budget of their own
  const share = a.totals.spendB > 0 ? r.b.spend / a.totals.spendB : 0;
  const pi = performanceIndex(r.kpiB, p.yardValue, r.mode);
  const yardShort =
    p.yardKind === "others" ? p.peerName
    : p.yardKind === "previous" ? `its ${a.selection.compareLabel} results`
    : p.yardKind === "history" ? "its past results"
    : p.yardKind === "target" ? "your target"
    : "break-even";

  // Title: the judgement in one line.
  let title: string;
  if (p.stance === "fix") title = p.findings.find((f) => f.action === p.action)?.title ?? "Problem found";
  else if (p.stance === "learn") title = "Still learning — too early to judge";
  else if (p.stance === "wait") title = !hasResults ? `Can't be judged — no ${def.resultLabel} column` : results === 0 ? `No ${def.resultLabel} yet — too early to judge` : `Only ${num(results)} ${def.resultLabel} so far — too early to judge`;
  else if (p.stance === "watch")
    title = `${pi !== null ? `${short} ${advantage(pi, r.mode)} than ${yardShort}` : p.pending === "scale" || p.pending === "reuse" ? "Looks better than expected" : "Looks worse than expected"} — not confirmed yet`;
  else if (pi !== null && (p.stance === "scale" || p.stance === "reuse" || p.stance === "cut" || p.stance === "avoid"))
    title = `${short} ${advantage(pi, r.mode)} than ${yardShort}${p.stance === "scale" ? (isAd ? " — make more like it" : p.targetGap !== null ? " — put more money in, still off target" : " — put more money in") : p.stance === "reuse" ? " — reuse this setup" : p.stance === "avoid" ? " — don't repeat as is" : ""}`;
  else if (p.stance === "cut" || p.stance === "avoid") title = `${money(r.b.spend, cur)} spent with no ${def.resultLabel}`;
  else title = pi !== null ? `In line with ${yardShort} (${advantage(pi, r.mode)})` : "Running — no yardstick to judge it by yet";

  const description =
    `${word.charAt(0).toUpperCase() + word.slice(1)} "${r.info.name}" spent ${money(r.b.spend, cur)}` +
    (hasResults && r.mode !== "cpm" ? ` and recorded ${num(results, true)} ${def.resultLabel}` : "") +
    (r.kpiB !== null ? ` (${kpiLabel(o, r.mode).toLowerCase()} ${fk(r.kpiB, r.mode, cur)})` : "") +
    ` in ${a.selection.label}` +
    (p.yardstick && r.kpiB !== null && p.stance !== "learn" ? `, compared with ${p.yardstick}.` : ".");

  const tiles: Detail["tiles"] = [
    { label: "Spend", value: money(r.b.spend, cur) },
    { label: def.resultLabel, value: hasResults ? num(results, true) : "not in report" },
    { label: kpiLabel(o, r.mode), value: fk(r.kpiB, r.mode, cur), sub: p.yardValue !== null ? `expected ${fk(p.yardValue, r.mode, cur)}` : undefined },
    { label: "Clicks", value: clicksKnown ? num(clicks, true) : "not in report", sub: clicksKnown && r.b.impressions > 0 ? `CTR ${pct(clicks / r.b.impressions)}` : undefined },
    { label: "Share of account spend", value: pct(share, 1) },
  ];

  // Why this might be happening.
  const why: string[] = [];
  // Explain the difference against its own past when that's the yardstick, else against the other campaigns.
  const theirs = p.past ?? p.peers ?? r.a;
  const theirName = p.past ? (p.yardKind === "history" ? "its past results" : `its ${a.selection.compareLabel} results`) : p.peers ? p.peerName : a.selection.compareLabel;
  const worse = p.stance === "cut" || p.stance === "avoid";
  if (p.stance === "fix") {
    const f = p.findings.find((x) => x.action === p.action);
    if (f) why.push(f.likelyCause, f.whyItMatters);
  } else if (p.stance === "watch") {
    why.push(`Not confirmed yet: ${p.unconfirmed}.`);
    if (theirs) why.push(...driverHypotheses(o, r.mode, r.b, theirs, p.pending === "scale" || p.pending === "reuse", theirName, cur).slice(0, 2));
  } else if (p.stance === "learn") {
    why.push("The platform is still testing who to show the ads to. Results during learning are usually less stable and more expensive than after it.");
    why.push("Changing the budget, audience or ads now can restart learning.");
  } else if (p.stance === "wait" && hasResults && results === 0) {
    const rateBase = p.past ?? p.peers ?? r.a;
    const onPlatform = !def.postClick;
    if (rateBase) {
      const baseResults = resultCount(rateBase, o);
      const base = onPlatform ? rateBase.impressions : clicksOf(rateBase);
      const mineBase = onPlatform ? r.b.impressions : clicks;
      if (base > 0) {
        const expected = (baseResults / base) * mineBase;
        why.push(
          `At ${p.past ? "its own past" : p.peers ? (isAd ? "the other ads'" : "your other campaigns'") : "its earlier"} rate, this much ${onPlatform ? "delivery" : "traffic"} would be expected to bring about ${num(expected)} ${def.resultLabel}, so zero ${expected < 3 ? "may simply be too little traffic so far" : "is unusual"}.`,
        );
      }
    } else why.push(`There's no baseline rate to compare with, so zero ${def.resultLabel} may simply be too little traffic so far.`);
    why.push("The audience may not match the offer, so the ads reach people with little interest.");
    if (def.postClick) why.push("The landing page, form or checkout may not be converting the traffic it gets.");
    why.push(`Tracking may not be recording ${def.resultLabel} for this ${word}, in which case results happen but aren't reported.`);
  } else if (p.stance === "wait") {
    if (!hasResults) why.push(`The export has no ${RESULT_MEASURES[o].map((k) => MEASURE_LABEL[k]).join(" or ")} column, so AdMate can't count ${def.resultLabel}.`);
    else why.push(`With only ${num(results)} ${def.resultLabel}, one more or one fewer would change the ${kpiLabel(o, r.mode).toLowerCase()} by about ${pct(1 / Math.max(results, 1), 0)}, so the number isn't stable yet.`);
  } else if (theirs) {
    why.push(...driverHypotheses(o, r.mode, r.b, theirs, !worse, theirName, cur));
    if (worse && def.postClick && !why.some((w) => w.includes("conversion rate"))) why.push("The audience may not match the offer, so clicks arrive with low intent.");
    if (p.stance === "scale") why.push(isAd ? "Same audience and budget as the other ads in its ad set, so the difference comes from the ad itself: its hook, visual or message." : "Its budget may be what limits it, not its audience — so more budget can bring more results at a similar cost.");
    if (p.stance === "keep" || p.stance === "average") {
      why.length = 0;
      why.push(`Its ${kpiLabel(o, r.mode).toLowerCase()} is within 20% of ${p.yardstick}, so no single factor stands out.`);
      why.push(...driverHypotheses(o, r.mode, r.b, theirs, true, theirName, cur).slice(0, 1));
    }
  } else if (p.yardKind === "target" || p.yardKind === "break_even") {
    why.push(`${short} ${fk(r.kpiB, r.mode, cur)} vs ${p.yardstick}. There's no earlier period or other ${word} to compare it with, so AdMate can't break down what drives the difference yet.`);
  }
  if (why.length === 0) why.push("The numbers don't point to one clear driver.");

  // What to do next.
  const main = theirs ? decompose(o, r.mode, theirs, r.b)?.drivers.filter((d) => Number.isFinite(d.change) && !d.helped).sort((x, y) => y.weight - x.weight)[0] : undefined;
  // The best other item with the same objective (where to move budget to).
  const bestRow = p.peers
    ? (r.level === "campaign" ? a.campaigns : a.byLevel[r.level])
        .filter((x) => p.peerIds.includes(x.info.id) && x.kpiB !== null)
        .sort((x, y) => (performanceIndex(y.kpiB, x.kpiB, r.mode) ?? 1) - 1)[0]
    : undefined;
  const todo: string[] = [];
  switch (p.stance) {
    case "scale":
      if (isAd) {
        todo.push(
          "Keep it running unchanged.",
          "Make 2–3 new versions of it: the same idea with a new hook, first 3 seconds or visual.",
          bestRow ? `To give it more of the ad set's budget, pause the weakest other ad there rather than raising the budget.` : "Raise the ad set's budget only if the ad set as a whole is doing well.",
        );
        break;
      }
      todo.push(`Raise the budget by about 20%${r.info.budget ? ` (${money(r.info.budget, cur)} → ${money(r.info.budget * 1.2, cur)} a day)` : ""}.`, "Wait 3–4 days before raising again; big jumps can restart the learning phase.", `Keep the creative and audience as they are while scaling. If ${short} rises above ${fk(p.yardValue, r.mode, cur)}, roll back.`);
      break;
    case "reuse":
      todo.push(`Start the next ${def.label.toLowerCase()} flight from this ${word} (duplicate it).`, "Bring fresh creative so the same audience doesn't tire of it.", `Give it a bigger share of the budget than the weaker ${LEVEL_WORD[r.level].many}.`);
      break;
    case "cut":
      if (isAd) {
        todo.push(
          `Pause this ad, or replace it with a new version${main ? `: ${DRIVER_ACTION[main.key].charAt(0).toLowerCase()}${DRIVER_ACTION[main.key].slice(1)}` : " (new hook or first 3 seconds)."}`,
          // Only name a sibling as "better" when it really was the yardstick and beats this ad.
          bestRow && p.yardKind === "others" && (performanceIndex(bestRow.kpiB, r.kpiB, r.mode) ?? 0) > 1
            ? `Its budget then goes to the better ads in the ad set, such as "${bestRow.info.name}".`
            : "Its budget then goes to the other ads in the ad set.",
          "Re-check the ad set after 5–7 days.",
        );
        break;
      }
      todo.push(`Lower its budget by 20–30%${bestRow ? ` and move that money to "${bestRow.info.name}"` : ""}.`, main ? DRIVER_ACTION[main.key] : "Look for what's different from your better campaigns (audience, creative, offer).", "Re-check after 5–7 days before cutting further.");
      break;
    case "avoid":
      todo.push("Don't duplicate this setup as is for the next flight.", main ? NEXT_FLIGHT[main.key] : "Change the audience or creative before running it again.", bestRow ? `Give its budget to a setup like "${bestRow.info.name}" instead.` : "Give its budget to your better setups instead.");
      break;
    case "fix": {
      const f = p.findings.find((x) => x.action === p.action);
      todo.push(p.action);
      if (f) todo.push(`Re-check in ${f.recheckDays} day${f.recheckDays === 1 ? "" : "s"}: ${f.recheckRule}`);
      todo.push("Don't change the budget until this is sorted out.");
      break;
    }
    case "keep":
      todo.push(isAd ? "Keep it running." : "Keep the budget as it is.", main ? `To improve it, work on its weakest step: ${DRIVER_ACTION[main.key].charAt(0).toLowerCase()}${DRIVER_ACTION[main.key].slice(1)}` : "To improve it, test one new creative or audience at a time.", p.yardKind === "target" ? "Check it again after the next report." : "Set a target in Targets & settings so AdMate can judge it against your goal.");
      break;
    case "average":
      todo.push("Fine to reuse in the next flight.", "Bring fresh creative to push it above average.", "Set a target so AdMate can judge it against your goal next time.");
      break;
    case "watch":
      todo.push(
        "Keep it as it is for now: don't change the budget on this alone.",
        `Re-check after the next period. If it holds, AdMate will suggest: ${PENDING_WORDS[p.pending ?? "scale"]}.`,
      );
      break;
    case "learn":
      todo.push("Don't change the budget, audience or ads for now.", "Judge it after it has run 7 days (Meta needs about 50 results a week to finish learning).", "Check that it's delivering (spend going out every day).");
      break;
    case "wait":
      if (!hasResults) todo.push("Re-export the report with the Results column included, then upload it again.");
      else if (results === 0) todo.push(`Confirm the ${def.resultSingular} event is being tracked, so you know a zero means zero.`, "Don't pause on this evidence alone: more traffic is needed before zero results is conclusive.", "If you need to limit risk meanwhile, cap the budget rather than pausing, so data keeps arriving.");
      else {
        const more = r.mode === "cost" && !def.perThousand && r.kpiB ? money((10 - results) * r.kpiB, cur) : null;
        todo.push("Leave it running unchanged for now.", `Re-check when it has at least 10 ${def.resultLabel}${more ? ` (about ${more} more spend at the current cost)` : ""}.`);
      }
      break;
  }

  // What to monitor afterwards.
  const monitor = [`${def.resultLabel.charAt(0).toUpperCase() + def.resultLabel.slice(1)} and ${kpiLabel(o, r.mode).toLowerCase()} over the next reporting period.`];
  if (p.stance === "scale") monitor.push(isAd ? `${short} of its new versions compared with this one over the next week.` : `${short} after each budget increase — roll back if it goes above ${fk(p.yardValue, r.mode, cur)}.`);
  else if (p.stance === "learn") monitor.push("Whether it leaves the learning phase (Meta shows \"Active\" instead of \"Learning\").");
  else if (results === 0 || def.postClick) monitor.push("Click-through rate and landing page traffic, to separate a delivery problem from a conversion problem.");
  else monitor.push("CTR and CPM, to see whether changes come from the ads or from the cost of showing them.");

  const judgedBy = [
    `Objective: ${def.label} — ${OBJECTIVE_SOURCE[r.info.objectiveSource] ?? "from your export"}.`,
    `Judged by ${kpiLabel(o, r.mode)}: ${kpiFormula(o, r.mode)}.`,
    p.yardstick
      ? isAd
        ? `Compared with ${p.yardstick}. An ad is compared with the other ads in its ad set first, because they share its audience and budget (like a creative test); then its own past results, then your target.${p.yardKind !== "others" ? ` ${p.peerCount ? "The other ads in its ad set don't have enough results yet (at least 10 needed), so it was judged on its own past instead." : "It's the only ad in its ad set, so it was judged on its own past instead."}` : ""}`
        : `Compared with ${p.yardstick}. AdMate uses its own past results first, then your target, then your other ${def.label.toLowerCase()} ${LEVEL_WORD[r.level].many}.`
      : `Nothing to compare with yet: no past results, no target, and no other ${isAd ? "ad in its ad set" : "campaign with this objective"}.`,
    isAd
      ? "Rule: at least 20% better than its siblings (as worded on this card) → make more like it (high); at least 20% worse → pause or replace (high); within 20% → keep (medium). The difference must be statistically clear, otherwise it's an early signal (low). Fewer than 10 results → low."
      : "Rule: at least 20% better (as worded on this card) → put more money in (high); at least 20% worse → cut or fix (high); within 20% → keep (medium). A better/worse call must be statistically significant and also hold against its longer history, otherwise it's an early signal (low). Learning or fewer than 10 results → low.",
    ...(p.targetGap !== null && r.goal ? [`Judged against its own past first (your setting). It is still ${pct(p.targetGap, 0)} worse than ${r.goal.source === "target" ? "your target" : "break-even"} (${fk(r.goal.value, r.mode, cur)}).`] : []),
    ...(p.smallBudget ? [`Medium instead of high: it's only ${pct(share, 1)} of all spend, so the money at stake is small.`] : []),
  ];

  // Priority = how much it matters now; confidence (below) = how sure AdMate is.
  const owning = p.stance === "fix" ? p.findings.find((f) => f.action === p.action) : undefined;
  const priorityReason = owning
    ? owning.priorityReason
    : p.smallBudget
      ? `Medium instead of high: it's only ${pct(share, 1)} of all spend, so little money is at stake.`
      : p.priority === "high"
        ? /below break-even|with no /.test(p.why)
          ? "High: it's losing money (below break-even, or spending with no results)."
          : `High: it's clearly ${p.stance === "scale" || p.stance === "reuse" ? "better" : "worse"} than expected, and the change is confirmed.`
        : p.priority === "medium"
          ? "Medium: it's within 20% of what's expected, so nothing is urgent."
          : p.stance === "watch"
            ? "Low: the change isn't confirmed yet, so there's nothing to act on today."
            : p.stance === "learn"
              ? "Low: it's still in the learning phase."
              : "Low: not enough results yet to judge it.";

  return {
    key: p.key,
    priority: p.priority,
    priorityReason,
    cost: owning?.extraCost?.text ?? null,
    kind: p.kind,
    isNew: r.isNew,
    ended: p.ended,
    title,
    // Full path, so an ad set or ad is never mistaken for one in another campaign:
    // "Campaign › Ad set" or "Campaign › Ad set › Ad".
    where: [
      r.level === "ad" ? a.campaigns.find((c) => c.info.id === r.info.campaignId)?.info.name ?? null : null,
      r.level !== "campaign" && r.info.parentName ? r.info.parentName : null,
      r.info.name,
    ].filter(Boolean).join(" › "),
    whereLabel: word.charAt(0).toUpperCase() + word.slice(1),
    platform: r.info.platform,
    description,
    tiles,
    whyHappening: why.filter(Boolean),
    whatToDo: todo,
    monitor,
    cantTell: limitations(a, r, o),
    note: p.past
      ? null
      : `No past results for this ${word} yet, so AdMate compared it with ${p.yardstick ?? "nothing yet"}. How AdMate judges a campaign, in order: ① its own past results → ② your target → ③ your other campaigns with the same goal → ④ industry benchmarks for Cambodia, once reliable Cambodian data is available (AdMate doesn't show estimated benchmark numbers). Upload an earlier report to judge it against its own history.`,
    risk:
      p.stance === "scale"
        ? `Bigger budgets reach less-ideal people, so the cost per result usually rises a little.${p.targetGap !== null ? " It is still above your target, so scale in small steps and stop if it drifts further away." : ""}`
        : null,
    confidence: p.stance === "learn" || p.stance === "wait" || p.stance === "watch" ? "low" : r.confidence,
    confidenceText:
      p.stance === "watch"
        ? `Low — not confirmed yet: ${p.unconfirmed}.`
        : confidenceText(p.stance === "learn" || p.stance === "wait" ? "low" : r.confidence, results, def.resultLabel, p.stance),
    judgedBy,
    evidence: p.evidence,
    status: p.status,
    dismissReason: p.dismissReason,
    askQuestion: `Explain ${r.info.name}: why is it "${p.assessment.toLowerCase()}", and what should I do first?`,
  };
}

// ---------------- detected problem (finding) → detail ----------------
export function findingDetail(a: Analysis, f: Finding): Detail {
  const cur = a.workspace.currency;
  const def = OBJECTIVE_DEFS[f.objective];
  const rows = f.level === "account" ? [] : f.level === "campaign" ? a.campaigns : a.byLevel[f.level];
  const row = rows.find((r) => r.info.id === f.entityId) ?? null;
  const results = row ? resultCount(row.b, f.objective) : 0;
  const tiles: Detail["tiles"] = [
    { label: f.bucket === "opportunity" ? "Spend" : "Money at stake", value: money(f.moneyAtStake, cur) },
    { label: "Share of account spend", value: pct(f.stakeShare, 1) },
    ...f.evidence.slice(0, 3).map((e) => ({ label: e.label, value: e.b, sub: e.a !== null ? `was ${e.a}` : undefined })),
  ];
  const where =
    f.level === "account"
      ? f.entityName
      : [f.campaignName, f.level === "ad" && f.parentName !== f.campaignName ? f.parentName : null, f.level !== "campaign" ? f.entityName : null].filter(Boolean).join(" › ");
  return {
    key: f.key,
    priority: f.priority,
    priorityReason: f.priorityReason,
    cost: f.extraCost?.text ?? null,
    kind: f.bucket === "opportunity" ? "opportunity" : f.bucket === "monitor" ? "signal" : "issue",
    isNew: row?.isNew ?? false,
    ended: false,
    title: f.title,
    where: where || null,
    whereLabel: f.level === "account" ? "Whole account" : "Campaign",
    platform: f.platform,
    description: f.whatHappened,
    tiles,
    whyHappening: [f.likelyCause, f.whyItMatters, ...f.related],
    whatToDo: [f.action, `Re-check in ${f.recheckDays} day${f.recheckDays === 1 ? "" : "s"}: ${f.recheckRule}`],
    monitor: [f.recheckRule],
    cantTell: limitations(a, row, f.objective),
    note: null,
    risk: f.risk,
    confidence: f.confidence,
    confidenceText: `${f.confidence.charAt(0).toUpperCase() + f.confidence.slice(1)} — based on ${f.dataBasis}.` + (f.confidence === "low" ? ` Too little data to act on yet${results ? ` (${num(results)} ${def.resultLabel})` : ""}.` : ""),
    judgedBy: [`Flagged because: ${f.rule}`, `Priority: ${f.priorityReason}`, `Objective: ${def.label}${f.platform ? ` on ${PLATFORM_LABEL[f.platform]}` : ""}.`],
    evidence: f.evidence,
    status: f.status,
    dismissReason: f.dismissReason,
    askQuestion: `Why is this happening, and what should I check first? (${f.title})`,
  };
}

