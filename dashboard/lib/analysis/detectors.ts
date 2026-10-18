import { addDays, rangeDays } from "../dates";
import { money, num, pct, shortDate, signedPct } from "../format";
import { emptyMeasures, sumMeasures, type Measures } from "../metrics/measures";
import { resultAvailable } from "../metrics/availability";
import { OBJECTIVE_DEFS, kpiShort, kpiValue, resultCount, type KpiMode, type Objective } from "../metrics/objectives";
import { PLATFORM_LABEL, type Platform } from "../ingest/headers";
import { isRunning } from "../ingest/normalize";
import { LESSON, LEVEL_WORD, reasonsFor } from "./compare";
import { decompose, mainDriver, type Driver } from "./decompose";
import { driverMeaning } from "./narrative";
import { performanceIndex } from "./goals";
import { advantage } from "./wording";
import { twoProportionP, type Confidence } from "./stats";
import { CHANGE_AT, direction, holds, minus, significant, STRONG_ALPHA } from "./stability";
import type { ActionType, Analysis, CampaignRow, Evidence, FactRow, Finding, Priority } from "./types";

type PartialAnalysis = Omit<Analysis, "findings" | "goalStatus" | "dataNotes" | "done" | "decisions">;

// What a detector produces. Priority, bucket, money at stake, extra cost and the
// data basis are attached afterwards, the same way for every detector.
interface Candidate {
  key: string;
  detector: string;
  actionType: ActionType;
  kind: "problem" | "opportunity";
  // Serious enough to be High priority on its own (with an optional minimum share of spend).
  urgent?: { reason: string; minShare: number };
  // Set when a trend isn't confirmed yet: the finding becomes an early signal.
  watchReason?: string;
  fixedPriority?: { priority: Priority; reason: string };
  row: CampaignRow | null;
  objective: Objective;
  platform: Platform | null;
  confidence: Confidence;
  rule: string;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  likelyCause: string;
  action: string;
  risk: string;
  recheckDays: number;
  recheckRule: string;
  evidence: Evidence[];
  related?: string[];
  // Account-level findings (no single row) give these directly.
  stake?: number;
  dataBasis?: string;
  entityName?: string;
}

function q(name: string) {
  return `‘${name}’`;
}

// Cost KPI (per result) or ROAS, formatted.
function fk(v: number | null, mode: KpiMode, currency: string) {
  return v === null ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v, currency);
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Campaign names often carry their launch date ("MM- Reach-22 Sep"). Returns the
// month named, if it is later than the end of the analysed period (same year).
function monthAfter(name: string, periodEnd: string): string | null {
  const endMonth = Number(periodEnd.slice(5, 7)) - 1;
  for (const token of name.toLowerCase().split(/[^a-z]+/)) {
    const i = MONTH_NAMES.findIndex((m, k) => token === m || token === MONTH_FULL[k].toLowerCase() || (m === "sep" && token === "sept"));
    if (i > endMonth) return MONTH_FULL[i];
  }
  return null;
}

function lowerConf(c: Confidence): Confidence {
  return c === "high" ? "medium" : "low";
}

// CTR compares like with like: link clicks when every period has them, else all
// clicks for every period (never link clicks in one and all clicks in the other).
const linkIn = (...ms: Measures[]) => ms.every((m) => m.linkClicks > 0);
const clicksOf = (m: Measures, link: boolean) => (link ? m.linkClicks : m.clicksAll);
const ctrOf = (m: Measures, link: boolean) => (m.impressions > 0 ? clicksOf(m, link) / m.impressions : 0);
const resultsKnown = (r: CampaignRow) => resultAvailable(r.availB, r.info.objective);
const isPaused = (r: CampaignRow) => !isRunning(r.info.status);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// What to do first, by the factor that moved the KPI most.
export const DRIVER_ACTION: Record<Driver["key"], string> = {
  cpm: "Ads got more expensive to show: check whether the audience got narrower or competition rose, and hold the budget until CPM settles.",
  ctr: "Fewer people click: refresh the creative (new hook or first 3 seconds) before spending more.",
  rate: "Fewer people respond to the ads: refresh the creative or the message before spending more.",
  cvr: "Clicks turn into results less often: check the landing page, form or offer after the click, and that conversions are still tracked.",
  frequency: "The same people see the ads more often: widen the audience or add fresh creative.",
  aov: "Orders got smaller: check the product mix and offers shown in the ads.",
};

function fmtDriver(key: Driver["key"], v: number, currency: string): string {
  if (key === "cpm" || key === "aov") return money(v, currency);
  if (key === "frequency") return v.toFixed(2);
  return pct(v);
}

// Detectors run in this order of precedence: when several fire on the same item,
// the one that explains the problem best is kept (a diagnosis like "check the
// landing page" beats generic budget advice like "cut the budget").
const PRECEDENCE = [
  "tracking_break", "revenue_break", "post_click_drop", "creative_fatigue", "zero_results_child", "ad_ctr_drop", "cpm_spike", "spend_up_results_down",
  "wasted_spend", "underperformer", "budget_concentration", "saturation", "kpi_worsened",
  "budget_winner", "strong_performer", "lesson_underperformer", "lesson_winner", "no_delivery",
];

export function detect(a: PartialAnalysis, recentDaily: FactRow[]): Finding[] {
  const currency = a.workspace.currency;
  const lenB = rangeDays(a.selection.b.from, a.selection.b.to);
  const cmpLabel = a.selection.compareLabel;
  const out: Candidate[] = [];
  const campaignById = new Map(a.campaigns.map((r) => [r.info.id, r]));
  const children = (campaignId: string) => {
    const ads = a.byLevel.ad.filter((r) => r.info.campaignId === campaignId);
    return ads.length ? ads : a.byLevel.ad_group.filter((r) => r.info.campaignId === campaignId);
  };

  // New / stopped ads (or ad sets) inside a campaign: facts the user recognises
  // and a common cause of a change.
  function changedInside(campaignId: string): string[] {
    if (!a.hasComparisonData) return [];
    const kids = children(campaignId);
    if (!kids.length) return [];
    const word = LEVEL_WORD[kids[0].level];
    const started = kids.filter((k) => k.isNew).map((k) => q(k.info.name));
    const stopped = kids.filter((k) => k.isStopped).map((k) => q(k.info.name));
    const list = (xs: string[]) => `${xs.slice(0, 3).join(", ")}${xs.length > 3 ? ` and ${xs.length - 3} more` : ""}`;
    const res: string[] = [];
    if (started.length) res.push(`${started.length} new ${started.length === 1 ? word.one : word.many} started this period: ${list(started)}.`);
    if (stopped.length) res.push(`${stopped.length} ${stopped.length === 1 ? word.one : word.many} stopped: ${list(stopped)}.`);
    return res;
  }

  // Ads in a campaign whose CTR fell the most (for "review the 3 ads with the
  // largest CTR decline").
  function worstCtrDrops(campaignId: string): CampaignRow[] {
    return children(campaignId)
      .filter((k) => k.aRaw && k.aRaw.impressions >= 500 && k.b.impressions >= 500 && clicksOf(k.aRaw, linkIn(k.aRaw, k.b)) > 0)
      .map((k) => ({ k, ch: ctrOf(k.b, linkIn(k.aRaw!, k.b)) / ctrOf(k.aRaw!, linkIn(k.aRaw!, k.b)) - 1 }))
      .filter((x) => x.ch <= -0.15)
      .sort((x, y) => x.ch - y.ch)
      .slice(0, 3)
      .map((x) => x.k);
  }
  // Is a "got worse" trend real and lasting (MRD §16.3)? Returns why not, or null.
  // A missing longer history doesn't block the call (monthly flights only have
  // two months); a longer history that disagrees does.
  const lenA = a.selection.a ? rangeDays(a.selection.a.from, a.selection.a.to) : 0;
  function worseUnconfirmed(o: Objective, mode: KpiMode, A: Measures, B: Measures, hist: { m: Measures; days: number } | null, bMature: Measures | null, kpiA: number): string | null {
    if (lenB === 1) return "a single day is too noisy to act on";
    if (!significant(o, mode, A, B)) return "the change could still be chance at this volume";
    const older = hist && hist.days - lenA >= lenA ? minus(hist.m, A) : null;
    if (older && (mode === "cpm" || resultCount(older, o) >= 10) && !holds(o, mode, older, B, "worse", STRONG_ALPHA)) {
      return `compared with the older history it isn't clearly worse yet, so ${cmpLabel} may have been unusually good`;
    }
    return matureUnconfirmed(o, mode, bMature, kpiA);
  }
  // A drop that sits only in the days whose conversions may still grow.
  function matureUnconfirmed(o: Objective, mode: KpiMode, bMature: Measures | null, kpiA: number | null): string | null {
    if (!bMature || !OBJECTIVE_DEFS[o].postClick || kpiA === null) return null;
    const mature = mode === "cpm" || resultCount(bMature, o) >= 10 ? kpiValue(bMature, o, mode) : null;
    return direction(performanceIndex(mature, kpiA, mode), mode) !== "worse" ? "most of the drop is in the last few days, whose results may still grow" : null;
  }

  const ctrLine = (k: CampaignRow) => {
    const link = linkIn(k.aRaw!, k.b);
    return `${q(k.info.name)}: CTR ${pct(ctrOf(k.aRaw!, link))} → ${pct(ctrOf(k.b, link))} (${signedPct(ctrOf(k.b, link) / ctrOf(k.aRaw!, link) - 1)})`;
  };

  // ================= campaign level =================
  for (const row of a.campaigns) {
    const c = row.info;
    const o = c.objective;
    const def = OBJECTIVE_DEFS[o];
    const short = kpiShort(o, row.mode);
    const results = resultCount(row.b, o);
    const yard = row.goal?.value ?? row.peerKpi;
    const yardName = row.goal ? (row.goal.source === "target" ? "your target" : "break-even") : `the ${row.peerCount} similar ${PLATFORM_LABEL[c.platform]} campaigns`;
    const paused = isPaused(row);
    const base = { row, objective: o, platform: c.platform };

    // ---- active but not delivering ----
    if (row.b.spend <= 0 && row.b.impressions <= 0 && (c.status === "active" || c.status === "learning")) {
      const review = /review|reject|disapprov/i.test(c.secondaryStatus ?? "");
      const startsLater = monthAfter(c.name, a.selection.b.to);
      out.push({
        ...base, key: `no_delivery:${c.id}`, detector: "no_delivery", actionType: "CHECK_DELIVERY", kind: "problem", confidence: "high",
        fixedPriority: { priority: "medium", reason: "It's set to active but isn't spending — worth a quick check whatever its size." },
        rule: "Status is active, but it spent nothing in the period.",
        title: `Check why ${q(c.name)} isn't delivering`,
        whatHappened: `${q(c.name)} is set to active on ${PLATFORM_LABEL[c.platform]} but spent nothing in ${a.selection.label}.`,
        whyItMatters: "If it was meant to run, every idle day is reach and results you don't get.",
        likelyCause: review
          ? `The platform reports “${c.secondaryStatus}”, so its ads may be stuck in review.`
          : startsLater
            ? `Its name mentions ${startsLater}, so it may simply be scheduled to start later.`
            : "It may be scheduled to start later, out of budget, still in review, or its audience may be too narrow.",
        action: "Open the campaign and check its schedule, budget, ad approval and audience size.",
        risk: "If it's scheduled on purpose, there's nothing to do.",
        recheckDays: 2, recheckRule: "After your next upload, it should show spend above zero.",
        evidence: [{ label: "Status", a: null, b: [c.status, c.secondaryStatus].filter(Boolean).join(" · ") }, { label: "Spend", a: null, b: money(0, currency) }],
      });
      continue;
    }
    if (row.b.spend <= 0) continue;

    // ---- wasted spend: money out, no results ----
    // Zero results is waste whatever the funnel role, so without a target or a
    // same-role peer group, the other campaigns with this objective are the yardstick.
    const anyRole = (() => {
      const rest = a.campaigns.filter((r) => r !== row && r.info.objective === o && r.mode === row.mode && r.b.spend > 0 && resultsKnown(r));
      return rest.length ? kpiValue(sumMeasures(rest.map((r) => r.b)), o, row.mode) : null;
    })();
    const wasteYard = yard ?? anyRole;
    if (results === 0 && resultsKnown(row) && o !== "awareness" && o !== "traffic" && wasteYard && row.mode === "cost") {
      const yard = wasteYard;
      if (row.b.spend >= 2 * yard) {
        const strong = row.b.spend >= 3 * yard;
        out.push({
          ...base, key: `wasted_spend:${c.id}`, detector: "wasted_spend", actionType: strong ? "PAUSE" : "REDUCE_BUDGET", kind: "problem",
          confidence: strong ? "high" : "medium",
          urgent: { reason: "It is spending real money with zero results.", minShare: 0.05 },
          rule: `Spent at least 2× ${row.goal ? "your target" : "the typical"} ${short} (${money(yard, currency)}) with zero ${def.resultLabel}.`,
          title: `${strong ? "Pause" : "Cut the budget of"} ${q(c.name)}`,
          whatHappened: `${q(c.name)} spent ${money(row.b.spend, currency)} in ${a.selection.label} with no ${def.resultLabel}.`,
          whyItMatters: `That's ${(row.b.spend / yard).toFixed(1)}× what one ${def.resultSingular} normally costs, with nothing to show for it.`,
          likelyCause: "Either the audience or offer isn't working, or results are happening but not being tracked.",
          action: strong ? "Pause it, or move its budget to a campaign that is producing results. First check that its results are tracked." : "Cut its budget by half until it produces results, and check that its results are tracked.",
          risk: `If results are recorded somewhere else (offline, a different conversion event), check that before pausing.`,
          recheckDays: 3, recheckRule: `If you keep it running, expect at least one ${def.resultSingular} per ${money(yard, currency)} spent.`,
          evidence: [
            { label: "Spend", a: row.a ? money(row.a.spend, currency) : null, b: money(row.b.spend, currency) },
            { label: def.resultLabel, a: row.a ? num(resultCount(row.a, o)) : null, b: "0" },
            { label: row.goal ? "Target" : "Typical cost per result", a: null, b: money(yard, currency) },
          ],
        });
      }
      continue;
    }
    // ---- revenue stopped being recorded while purchases continue ----
    const revenueBefore = (row.aRaw?.conversionValue ?? 0) > 0 || (row.history?.m.conversionValue ?? 0) > 0;
    if (row.mode === "roas" && row.availB.has("conversionValue") && results > 0 && row.b.conversionValue <= 0 && revenueBefore) {
      out.push({
        ...base, key: `revenue_break:${c.id}`, detector: "revenue_break", actionType: "FIX_TRACKING", kind: "problem", confidence: "high",
        urgent: { reason: "Revenue isn't being recorded: ROAS and every profit check are blind until it's fixed.", minShare: 0 },
        rule: "Purchases were recorded but revenue was zero, while earlier data had revenue.",
        title: `Check revenue tracking on ${q(c.name)}`,
        whatHappened: `${q(c.name)} recorded ${num(results)} ${def.resultLabel} in ${a.selection.label} but no revenue, although earlier data had revenue.`,
        whyItMatters: "ROAS reads as zero, so AdMate can't tell whether this campaign makes money — and the platform may be optimising without purchase values.",
        likelyCause: "The purchase event is firing without its value (a pixel or Conversions API change), or the export is missing the purchase value column.",
        action: `Make a test purchase and check the event includes its value in ${PLATFORM_LABEL[c.platform]}'s events manager. If tracking is fine, re-export with the purchase conversion value column.`,
        risk: "If you changed the export's columns, re-export before changing any tracking.",
        recheckDays: 1, recheckRule: "Revenue should appear next to purchases again.",
        evidence: [
          { label: cap(def.resultLabel), a: row.aRaw ? num(resultCount(row.aRaw, o)) : null, b: num(results) },
          { label: "Revenue", a: row.aRaw ? money(row.aRaw.conversionValue, currency) : null, b: money(0, currency) },
        ],
      });
      continue;
    }
    if (row.kpiB === null) continue;

    // ---- underperformer drag ----
    const piJudge = row.piGoal ?? row.piPeer;
    // Not while it's clearly improving on its own past: AdMate judges past-first
    // (founder decision), and the campaign card shows the gap to the target instead.
    const improving = direction(row.piTrend, row.mode) === "better";
    if (piJudge !== null && piJudge < 0.7 && row.spendShare >= 0.15 && !paused && !improving) {
      out.push({
        ...base, key: `underperformer:${c.id}`, detector: "underperformer", actionType: "REDUCE_BUDGET", kind: "problem", confidence: row.confidence,
        rule: `Its ${short} is more than 30% worse than ${row.piGoal !== null ? "your target" : "similar campaigns"}, and it has at least 15% of this objective's budget.`,
        title: `Reduce the budget of ${q(c.name)}`,
        whatHappened: `${q(c.name)} has a ${short} of ${fk(row.kpiB, row.mode, currency)}, ${advantage(piJudge, row.mode)} than ${yardName} (${fk(yard, row.mode, currency)}).`,
        whyItMatters: `It takes ${pct(row.spendShare, 0)} of this objective's budget, so it pulls the whole account's ${short} down.`,
        likelyCause: "Its audience, creative or offer delivers less for the same money than your other campaigns.",
        action: "Lower its budget by 20–30% and move that money to the best-performing campaign with the same objective.",
        risk: "Cutting too hard can push it back into the learning phase: change the budget in one step and wait.",
        recheckDays: 5, recheckRule: `Keep the cut if ${short} doesn't improve toward ${fk(yard, row.mode, currency)}.`,
        evidence: [
          { label: short, a: row.kpiA !== null ? fk(row.kpiA, row.mode, currency) : null, b: fk(row.kpiB, row.mode, currency) },
          { label: row.goal ? "Target" : "Similar campaigns", a: null, b: fk(yard, row.mode, currency) },
          { label: "Share of spend", a: null, b: pct(row.spendShare, 0) },
        ],
      });
    }

    // ---- budget concentration: one campaign carries most of the objective ----
    // Only against campaigns with the same funnel role: a prospecting campaign
    // always looks expensive next to retargeting.
    if (row.spendShare >= 0.4 && !paused) {
      const rest = a.campaigns.filter((r) => r !== row && r.info.objective === o && r.role === row.role && r.b.spend > 0 && r.kpiB !== null && r.mode === row.mode && resultsKnown(r));
      const restM = sumMeasures(rest.map((r) => r.b));
      const restKpi = rest.length ? kpiValue(restM, o, row.mode) : null;
      const pi = performanceIndex(row.kpiB, restKpi, row.mode);
      if (pi !== null && pi < 0.85 && resultCount(restM, o) >= 10) {
        const best = [...rest].sort((x, y) => (performanceIndex(y.kpiB, restKpi, row.mode) ?? 0) - (performanceIndex(x.kpiB, restKpi, row.mode) ?? 0))[0];
        out.push({
          ...base, key: `concentration:${c.id}`, detector: "budget_concentration", actionType: "SHIFT_BUDGET", kind: "problem",
          confidence: resultCount(restM, o) >= 20 ? row.confidence : lowerConf(row.confidence),
          rule: `It has at least 40% of this objective's budget and its ${short} is at least 15% worse than the rest.`,
          title: `${q(c.name)} takes ${pct(row.spendShare, 0)} of your ${def.label.toLowerCase()} budget but performs worse`,
          whatHappened: `${q(c.name)} gets a ${short} of ${fk(row.kpiB, row.mode, currency)}; your other ${def.label.toLowerCase()} campaigns together get ${fk(restKpi, row.mode, currency)} (${advantage(1 / pi, row.mode)}).`,
          whyItMatters: "Most of the budget sits in the least efficient place, so the account as a whole pays more per result than it needs to.",
          likelyCause: "Budget often follows history rather than current performance; the campaign may have been the main one before the others proved better.",
          action: `Move 15–20% of its budget to ${best ? q(best.info.name) : "your better campaigns"} and watch both for a week.`,
          risk: "Its larger audience may be hard to replace; shift in steps rather than all at once.",
          recheckDays: 7, recheckRule: `Keep shifting while the receiving campaign's ${short} stays better than ${fk(row.kpiB, row.mode, currency)}.`,
          evidence: [
            { label: short, a: null, b: fk(row.kpiB, row.mode, currency) },
            { label: "Other campaigns", a: null, b: fk(restKpi, row.mode, currency) },
            { label: "Share of spend", a: null, b: pct(row.spendShare, 0) },
          ],
        });
      }
    }

    // ---- ended campaigns: lessons for the next flight ----
    if (paused && piJudge !== null && row.spendShare > 0) {
      const vs = row.piGoal !== null ? "your target" : `the ${row.peerCount} similar ${PLATFORM_LABEL[c.platform]} campaigns in ${a.selection.label}`;
      if (piJudge > 1.2) {
        out.push({
          ...base, key: `lesson_winner:${c.id}`, detector: "lesson_winner", actionType: "APPLY_LEARNING", kind: "opportunity", confidence: row.confidence,
          rule: `It has ended; its ${short} was at least 20% better than ${row.piGoal !== null ? "your target" : "similar campaigns"}.`,
          title: `Reuse the setup of ${q(c.name)} in the next flight`,
          whatHappened: `${q(c.name)} got a ${short} of ${fk(row.kpiB, row.mode, currency)}, ${advantage(piJudge, row.mode)} than ${vs} (${fk(yard, row.mode, currency)}).`,
          whyItMatters: "Its audience, placements and creative are proven for this account.",
          likelyCause: "It has ended, but it outperformed the rest.",
          action: `Start the next ${def.label.toLowerCase()} campaign from this one (duplicate it) and give it a bigger share of the budget than the weaker setups.`,
          risk: "Audiences tire: reuse the targeting, but bring fresh creative, or results will drift back toward average.",
          recheckDays: 7, recheckRule: `In the next flight, its ${short} should stay near ${fk(row.kpiB, row.mode, currency)}.`,
          evidence: [
            { label: short, a: null, b: fk(row.kpiB, row.mode, currency) },
            { label: row.piGoal !== null ? "Target" : "Similar campaigns", a: null, b: fk(yard, row.mode, currency) },
            { label: def.resultLabel, a: null, b: num(results, true) },
          ],
        });
      } else if (piJudge < 0.75 && row.spendShare >= 0.1) {
        out.push({
          ...base, key: `lesson_avoid:${c.id}`, detector: "lesson_underperformer", actionType: "APPLY_LEARNING", kind: "problem", confidence: row.confidence,
          rule: `It has ended; its ${short} was at least 25% worse than ${row.piGoal !== null ? "your target" : "similar campaigns"}, with at least 10% of the budget.`,
          title: `Don’t repeat the setup of ${q(c.name)}`,
          whatHappened: `${q(c.name)} got a ${short} of ${fk(row.kpiB, row.mode, currency)}, ${advantage(piJudge, row.mode)} than ${vs} (${fk(yard, row.mode, currency)}).`,
          whyItMatters: "Running the same setup again would likely cost more per result.",
          likelyCause: "Its audience or creative delivered noticeably less for the same money.",
          action: `Before the next ${def.label.toLowerCase()} flight, move this budget to the best-performing setup, or change its audience before running it again.`,
          risk: "Some audiences are worth a higher price (e.g. a key city or retargeting); keep it if that was the point.",
          recheckDays: 7, recheckRule: `If you run it again, its ${short} should get close to ${fk(yard, row.mode, currency)}.`,
          evidence: [
            { label: short, a: null, b: fk(row.kpiB, row.mode, currency) },
            { label: row.piGoal !== null ? "Target" : "Similar campaigns", a: null, b: fk(yard, row.mode, currency) },
            { label: "Share of spend", a: null, b: pct(row.spendShare, 0) },
          ],
        });
      }
      kpiWorsened(row, true);
      continue;
    }

    // ---- budget-limited winner (conservative scaling) ----
    const budgetCapped = /budget/i.test(c.secondaryStatus ?? "");
    if (piJudge !== null && piJudge > 1.2 && (row.spendShare < 0.15 || budgetCapped) && (row.piTrend === null || row.piTrend >= 0.9)) {
      out.push({
        ...base, key: `winner:${c.id}`, detector: "budget_winner", actionType: "SCALE_BUDGET", kind: "opportunity",
        confidence: row.piTrend === null ? lowerConf(row.confidence) : row.confidence,
        rule: `Its ${short} is at least 20% better than ${row.piGoal !== null ? "your target" : "similar campaigns"}, it held up vs the previous period, and it has under 15% of the budget${budgetCapped ? " (or the platform says it's budget-limited)" : ""}.`,
        title: `Consider giving ${q(c.name)} more budget`,
        whatHappened: `${q(c.name)} got a ${short} of ${fk(row.kpiB, row.mode, currency)}, ${advantage(piJudge, row.mode)} than ${yardName} (${fk(yard, row.mode, currency)})${budgetCapped ? `, and the platform says it ran ${c.secondaryStatus!.toLowerCase()}` : `, on only ${pct(row.spendShare, 0)} of the budget`}.`,
        whyItMatters: "Your most efficient campaigns get the least money; more of it here could bring more results for the same total budget.",
        likelyCause: "It's likely held back by budget rather than by its audience.",
        action: `Raise its budget by about 20%${c.budget ? ` (${money(c.budget, currency)} → ${money(c.budget * 1.2, currency)})` : ""}, then wait 3–4 days before raising again.`,
        risk: "Bigger budgets reach less-ideal people, so the cost per result usually rises a little. Large jumps can restart the learning phase.",
        recheckDays: 4, recheckRule: `Keep scaling while ${short} stays better than ${fk(yard, row.mode, currency)}; roll back if it passes it.`,
        evidence: [
          { label: short, a: row.kpiA !== null ? fk(row.kpiA, row.mode, currency) : null, b: fk(row.kpiB, row.mode, currency) },
          { label: row.goal ? "Target" : "Similar campaigns", a: null, b: fk(yard, row.mode, currency) },
          { label: "Share of spend", a: null, b: pct(row.spendShare, 0) },
        ],
      });
    }

    if (paused) {
      kpiWorsened(row, true);
      continue;
    }
    if (!row.a || !row.aRaw || row.kpiA === null) continue;
    const A = row.aRaw;
    const B = row.b;
    const worse = row.change !== null && (row.mode === "roas" ? row.change < -0.1 : row.change > 0.1);
    const freqA = row.availA?.has("reach") && A.reach > 0 ? A.impressions / A.reach : null;
    const freqB = row.availB.has("reach") && B.reach > 0 ? B.impressions / B.reach : null;

    // ---- creative fatigue: CTR down (significant), frequency up, results costlier ----
    const link = linkIn(A, B);
    if (worse && A.impressions > 1000 && B.impressions > 1000 && clicksOf(A, link) > 0) {
      const ctrChange = ctrOf(B, link) / ctrOf(A, link) - 1;
      const p = twoProportionP(clicksOf(A, link), A.impressions, clicksOf(B, link), B.impressions);
      const freqUp = freqA !== null && freqB !== null ? freqB >= 2.5 || freqB > freqA * 1.2 : true;
      if (ctrChange <= -0.2 && p < 0.05 && freqUp) {
        const worst = worstCtrDrops(c.id);
        out.push({
          ...base, key: `fatigue:${c.id}`, detector: "creative_fatigue", actionType: "REFRESH_CREATIVE", kind: "problem", confidence: row.confidence,
          rule: `CTR fell at least 20% (statistically significant), frequency rose or is above 2.5, and ${short} got more than 10% worse.`,
          title: `Refresh the creatives in ${q(c.name)}`,
          whatHappened: `CTR on ${q(c.name)} fell ${Math.abs(Math.round(ctrChange * 100))}% vs ${cmpLabel}${freqB ? ` and frequency is ${freqB.toFixed(1)}` : ""}; ${short} went from ${fk(row.kpiA, row.mode, currency)} to ${fk(row.kpiB, row.mode, currency)}.`,
          whyItMatters: `Fewer people click, so each ${def.resultSingular} costs more — and platforms show tired ads less.`,
          likelyCause: "People are seeing the same ads more often and reacting less. This usually means creative fatigue (a hypothesis: check nothing else changed).",
          action: worst.length
            ? `Add 2–3 new creatives (new hook or first 3 seconds, same format) before you raise the budget, starting with the ${worst.length === 1 ? "ad" : `${worst.length} ads`} whose CTR fell most (listed in the details).`
            : "Add 2–3 new creatives (new hook or first 3 seconds, same winning format) before you raise the budget.",
          risk: "A drop can also come from seasonality or an audience change; check that nothing else changed in the campaign.",
          recheckDays: 5, recheckRule: `The new creatives should bring CTR back toward ${pct(ctrOf(A, link))}.`,
          evidence: [
            { label: "CTR", a: pct(ctrOf(A, link)), b: pct(ctrOf(B, link)) },
            ...(freqA && freqB ? [{ label: "Frequency", a: freqA.toFixed(2), b: freqB.toFixed(2) }] : []),
            { label: short, a: fk(row.kpiA, row.mode, currency), b: fk(row.kpiB, row.mode, currency) },
          ],
          related: [...worst.map(ctrLine), ...changedInside(c.id)],
        });
        continue;
      }
    }

    // ---- post-click drop: clicks fine, conversions down ----
    if (worse && def.postClick && resultsKnown(row) && A.linkClicks > 0 && B.linkClicks > 0) {
      const ctrChange = ctrOf(B, true) / ctrOf(A, true) - 1;
      const cvrA = resultCount(A, o) / A.linkClicks;
      const cvrB = resultCount(B, o) / B.linkClicks;
      const p = twoProportionP(resultCount(A, o), A.linkClicks, resultCount(B, o), B.linkClicks);
      if (Math.abs(ctrChange) < 0.1 && cvrA > 0 && cvrB / cvrA - 1 <= -0.2 && p < 0.05) {
        // Conversions for the last days may still arrive: a drop only there is an early signal.
        const postClickWatch = matureUnconfirmed(o, row.mode, row.bMature, row.kpiA);
        out.push({
          ...base, key: `post_click:${c.id}`, detector: "post_click_drop", actionType: "CHECK_LANDING_PAGE", kind: "problem", confidence: postClickWatch ? "low" : row.confidence,
          ...(postClickWatch ? { watchReason: postClickWatch } : {}),
          rule: "CTR held within ±10%, but the conversion rate fell at least 20% (statistically significant).",
          title: `Check the landing page or form behind ${q(c.name)}`,
          whatHappened: `People click ${q(c.name)} as often as before (CTR ${signedPct(ctrChange)}), but the conversion rate fell from ${pct(cvrA)} to ${pct(cvrB)}.`,
          whyItMatters: `You pay for the same clicks but get fewer ${def.resultLabel} from them.`,
          likelyCause: "The ads still work; something after the click got worse — the page, the offer, the form, or tracking.",
          action: "Open the landing page on a phone, submit the form yourself, and confirm the conversion is recorded.",
          risk: "If the offer or price changed on purpose, this may be expected.",
          recheckDays: 3, recheckRule: `Conversion rate should recover toward ${pct(cvrA)}.`,
          evidence: [
            { label: "CTR", a: pct(ctrOf(A, true)), b: pct(ctrOf(B, true)) },
            { label: "Conversion rate", a: pct(cvrA), b: pct(cvrB) },
            { label: short, a: fk(row.kpiA, row.mode, currency), b: fk(row.kpiB, row.mode, currency) },
          ],
          related: changedInside(c.id),
        });
        continue;
      }
    }

    // ---- CPM spike with stable response ----
    if (worse && A.impressions >= 1000 && B.impressions >= 1000 && row.spendShare >= 0.1 && resultsKnown(row)) {
      const cpmA = (A.spend / A.impressions) * 1000;
      const cpmB = (B.spend / B.impressions) * 1000;
      const rateA = resultCount(A, o) / A.impressions;
      const rateB = resultCount(B, o) / B.impressions;
      const rateStable =
        rateA > 0 &&
        (Math.abs(rateB / rateA - 1) < 0.1 || twoProportionP(resultCount(A, o), A.impressions, resultCount(B, o), B.impressions) >= 0.1);
      if (cpmB / cpmA - 1 >= 0.25 && rateStable) {
        out.push({
          ...base, key: `cpm_spike:${c.id}`, detector: "cpm_spike", actionType: "HOLD_BUDGET", kind: "problem", confidence: row.confidence,
          rule: "CPM rose at least 25% while the result rate held steady, on a campaign with at least 10% of this objective's budget.",
          title: `Hold the budget on ${q(c.name)} while ad costs are high`,
          whatHappened: `CPM on ${q(c.name)} rose from ${money(cpmA, currency)} to ${money(cpmB, currency)} (${signedPct(cpmB / cpmA - 1)}), while people responded as before.`,
          whyItMatters: "You pay more for the same audience reaction, so every result costs more.",
          likelyCause: "Ads became more expensive to show — usually auction competition or a narrowing audience, not your creative.",
          action: "Don't raise the budget this week; check placements and whether the audience has become too small.",
          risk: "Seasonal peaks raise CPMs for everyone; cutting now can cost reach you need.",
          recheckDays: 7, recheckRule: `CPM should settle back toward ${money(cpmA, currency)}.`,
          evidence: [
            { label: "CPM", a: money(cpmA, currency), b: money(cpmB, currency) },
            { label: "Result rate", a: pct(rateA), b: pct(rateB) },
          ],
        });
      }
    }

    // ---- spend up, results flat or down ----
    spendUpResultsDown(row);

    // ---- the KPI got clearly worse (when no more specific diagnosis fired) ----
    kpiWorsened(row, false);

    // ---- awareness saturation ----
    if (o === "awareness" && freqB !== null && freqB > (lenB <= 7 ? 3 : 4)) {
      out.push({
        ...base, key: `saturation:${c.id}`, detector: "saturation", actionType: "EXPAND_AUDIENCE", kind: "problem", confidence: "medium",
        rule: `Average frequency above ${lenB <= 7 ? 3 : 4} in the period.`,
        title: `Widen the audience of ${q(c.name)}`,
        whatHappened: `${q(c.name)} showed its ads to each person ${freqB.toFixed(1)} times on average in ${a.selection.label}.`,
        whyItMatters: "Most of the budget goes to people who've already seen the ads, so new reach gets expensive.",
        likelyCause: "The audience is too small for the budget.",
        action: "Broaden the audience or add a frequency cap so the budget reaches new people.",
        risk: "Some repetition helps recall; don't cut frequency below ~2 for brand campaigns.",
        recheckDays: 7, recheckRule: "Frequency should fall and cost per 1K reached should drop.",
        evidence: [{ label: "Frequency", a: freqA ? freqA.toFixed(2) : null, b: freqB.toFixed(2) }],
      });
    }
  }

  // The primary KPI got at least 20% worse. For ended campaigns this is advice
  // for the next flight rather than something to change now.
  function kpiWorsened(row: CampaignRow, ended: boolean) {
    if (!row.a || !row.aRaw || row.kpiA === null || row.piTrend === null || direction(row.piTrend, row.mode) !== "worse" || row.spendShare < 0.1) return;
    const c = row.info;
    const o = c.objective;
    const def = OBJECTIVE_DEFS[o];
    const short = kpiShort(o, row.mode);
    const B = row.b;
    const base = { row, objective: o, platform: c.platform };
    const d = mainDriver(decompose(o, row.mode, row.a, B));
    const hist = row.history ? { m: row.history.m, days: rangeDays(row.history.from, row.history.to) } : null;
    const watch = worseUnconfirmed(o, row.mode, row.aRaw, B, hist, row.bMature, row.kpiA);
    out.push({
      ...base, key: `kpi_worse:${c.id}`, detector: "kpi_worsened", actionType: "INVESTIGATE", kind: "problem", confidence: watch ? "low" : row.confidence,
      ...(watch ? { watchReason: watch } : {}),
      rule: `${short} got at least ${Math.round(CHANGE_AT * 100)}% worse than ${cmpLabel} (statistically significant, and not contradicted by its longer history), on a campaign with at least 10% of this objective's budget.`,
      title: `${short} on ${q(c.name)} got ${advantage(row.piTrend, row.mode).replace("more expensive", "worse").replace("lower", "worse")}`,
      whatHappened: `${short} on ${q(c.name)} went from ${fk(row.kpiA, row.mode, currency)} to ${fk(row.kpiB, row.mode, currency)} (${signedPct(row.change)}) vs ${cmpLabel}.`,
      whyItMatters: row.mode === "roas" ? "Each dollar of ads brings back less revenue than before." : `You're paying more for each ${def.resultSingular} than before.`,
      likelyCause: d ? `Mainly because ${driverMeaning(d)} (${d.label} ${signedPct(d.change)}, ${pct(d.weight, 0)} of the movement).` : "The numbers don't point to one clear driver.",
      action: (ended ? "It has ended. Before running it again: " : "") + (d ? DRIVER_ACTION[d.key] : "Look for what changed between the two periods (budget, audience, ads, landing page)."),
      risk: ended ? "Results differ between flights for many reasons (season, offer, audience); treat this as a lead, not a verdict." : "One period can be noisy; check the trend over a few more days before making big changes.",
      recheckDays: 5, recheckRule: `${short} should move back toward ${fk(row.kpiA, row.mode, currency)}.`,
      evidence: [
        { label: short, a: fk(row.kpiA, row.mode, currency), b: fk(row.kpiB, row.mode, currency) },
        ...(d ? [{ label: d.label, a: fmtDriver(d.key, d.a, currency), b: fmtDriver(d.key, d.b, currency) }] : []),
        { label: "Spend", a: money(row.a.spend, currency), b: money(B.spend, currency) },
      ],
      related: changedInside(c.id),
    });
  }

  // Spend rose at least 20% while results didn't (campaign and ad set level).
  function spendUpResultsDown(row: CampaignRow) {
    const o = row.info.objective;
    if (!row.a || !row.aRaw || isPaused(row) || !resultsKnown(row) || o === "awareness") return;
    const spendChange = row.b.spend / row.a.spend - 1;
    const resA = resultCount(row.a, o);
    const resB = resultCount(row.b, o);
    if (!(row.a.spend > 0 && spendChange >= 0.2 && resultCount(row.aRaw, o) >= 10 && resB <= resA)) return;
    const def = OBJECTIVE_DEFS[o];
    const word = LEVEL_WORD[row.level].one;
    const campaignId = row.info.campaignId ?? row.info.id;
    const kids = row.level === "campaign" ? children(row.info.id) : [];
    const grew = kids
      .filter((k) => k.a && k.b.spend - k.a.spend > 0)
      .sort((x, y) => y.b.spend - y.a!.spend - (x.b.spend - x.a!.spend))
      .slice(0, 3)
      .map((k) => `${q(k.info.name)}: spend ${money(k.a!.spend, currency)} → ${money(k.b.spend, currency)}, ${def.resultLabel} ${num(resultCount(k.a!, o))} → ${num(resultCount(k.b, o))}`);
    const spendWatch = matureUnconfirmed(o, row.mode, row.bMature, row.kpiA);
    out.push({
      row, objective: o, platform: row.info.platform,
      key: `spend_up:${row.level}:${row.info.id}`, detector: "spend_up_results_down", actionType: "INVESTIGATE", kind: "problem", confidence: spendWatch ? "low" : row.confidence,
      ...(spendWatch ? { watchReason: spendWatch } : {}),
      rule: `Spend rose at least 20% while ${def.resultLabel} didn't grow (at least 10 in the earlier period).`,
      title: `Spend on ${q(row.info.name)} rose ${signedPct(spendChange)} but ${def.resultLabel} didn't`,
      whatHappened: `${cap(word)} ${q(row.info.name)}: spend ${money(row.a.spend, currency)} → ${money(row.b.spend, currency)} (${signedPct(spendChange)}), ${def.resultLabel} ${num(resA)} → ${num(resB)}${a.selection.normalized ? " (per period length)" : ""}.`,
      whyItMatters: "The extra money bought no extra results, so it was effectively wasted.",
      likelyCause: "The extra budget went to people who respond less — the audience is saturating, or a new ad set or ad is soaking up spend.",
      action: `Don't raise the budget further. Check where the extra spend went${grew.length ? " (below)" : ""} and cut back the parts that didn't add ${def.resultLabel}.`,
      risk: "If you raised the budget recently, results can lag for a few days while the platform adjusts.",
      recheckDays: 5, recheckRule: `${cap(def.resultLabel)} should grow with spend again, or spend should come back down.`,
      evidence: [
        { label: "Spend", a: money(row.a.spend, currency), b: money(row.b.spend, currency) },
        { label: def.resultLabel, a: num(resA), b: num(resB) },
      ],
      related: [...grew, ...(row.level === "campaign" ? changedInside(campaignId) : [])],
    });
  }
  for (const r of a.byLevel.ad_group) spendUpResultsDown(r);

  // ================= ad set / ad level =================
  const hasAds = a.byLevel.ad.length > 0;
  const creativeRows = hasAds ? a.byLevel.ad : a.byLevel.ad_group;
  for (const row of creativeRows) {
    const c = row.info;
    const o = c.objective;
    const def = OBJECTIVE_DEFS[o];
    const word = LEVEL_WORD[row.level];
    const parent = c.campaignId ? campaignById.get(c.campaignId) : undefined;
    if (!parent || isPaused(row) || row.b.spend <= 0) continue;
    const shareOfCampaign = parent.b.spend > 0 ? row.b.spend / parent.b.spend : 0;
    const base = { row, objective: o, platform: c.platform };

    // ---- CTR drop on one ad ----
    const A = row.aRaw;
    const link = A ? linkIn(A, row.b) : false;
    if (A && A.impressions >= 1000 && row.b.impressions >= 1000 && clicksOf(A, link) > 0 && shareOfCampaign >= 0.1) {
      const ctrChange = ctrOf(row.b, link) / ctrOf(A, link) - 1;
      const p = twoProportionP(clicksOf(A, link), A.impressions, clicksOf(row.b, link), row.b.impressions);
      if (ctrChange <= -0.2 && p < 0.05) {
        const minClicks = Math.min(clicksOf(A, link), clicksOf(row.b, link));
        out.push({
          ...base, key: `ad_ctr:${row.level}:${c.id}`, detector: "ad_ctr_drop", actionType: "REFRESH_CREATIVE", kind: "problem",
          confidence: minClicks >= 100 ? "high" : minClicks >= 30 ? "medium" : "low",
          rule: "CTR fell at least 20% (statistically significant), on at least 1,000 impressions in each period.",
          title: `CTR on ${word.one} ${q(c.name)} fell ${Math.abs(Math.round(ctrChange * 100))}%`,
          whatHappened: `CTR on ${q(c.name)} fell from ${pct(ctrOf(A, link))} to ${pct(ctrOf(row.b, link))} (${signedPct(ctrChange)}) vs ${cmpLabel}.`,
          whyItMatters: `It carries ${pct(shareOfCampaign, 0)} of ${q(parent.info.name)}'s spend; fewer clicks usually means each ${def.resultSingular} costs more.`,
          likelyCause: "People have seen it too often or the message no longer lands (creative fatigue). A hypothesis — check that its audience didn't change.",
          action: `Refresh or replace this ${word.one}: keep the format, change the hook or first 3 seconds. Don't raise the budget until CTR recovers.`,
          risk: "A new creative restarts learning for that ad; add the new version next to it before switching the old one off.",
          recheckDays: 5, recheckRule: `CTR should come back toward ${pct(ctrOf(A, link))}.`,
          evidence: [
            { label: "CTR", a: pct(ctrOf(A, link)), b: pct(ctrOf(row.b, link)) },
            { label: "Impressions", a: num(A.impressions, true), b: num(row.b.impressions, true) },
            ...(row.kpiA !== null && row.kpiB !== null ? [{ label: kpiShort(o, row.mode), a: fk(row.kpiA, row.mode, currency), b: fk(row.kpiB, row.mode, currency) }] : []),
          ],
        });
      }
    }

    // ---- an ad (set) spending with zero results inside a campaign that converts ----
    const parentResults = resultCount(parent.b, o);
    const yardC = row.goal?.value ?? parent.kpiB;
    if (resultCount(row.b, o) === 0 && resultsKnown(row) && row.mode === "cost" && o !== "awareness" && o !== "traffic" && parentResults >= 5 && yardC && row.b.spend >= 2 * yardC) {
      const strong = row.b.spend >= 3 * yardC;
      out.push({
        ...base, key: `zero:${row.level}:${c.id}`, detector: "zero_results_child", actionType: "PAUSE", kind: "problem",
        confidence: strong ? "high" : "medium",
        urgent: { reason: "It is spending real money with zero results.", minShare: 0.05 },
        rule: `Spent at least 2× ${row.goal ? "your target" : "its campaign's"} ${kpiShort(o, row.mode)} (${money(yardC, currency)}) with zero ${def.resultLabel}, while the rest of the campaign produced them.`,
        title: `Pause ${word.one} ${q(c.name)} — no ${def.resultLabel}`,
        whatHappened: `${q(c.name)} spent ${money(row.b.spend, currency)} with no ${def.resultLabel}, while ${q(parent.info.name)} as a whole got ${num(parentResults)} at ${fk(parent.kpiB, parent.mode, currency)} each.`,
        whyItMatters: `That money would have bought about ${num(row.b.spend / yardC)} ${def.resultLabel} at the campaign's usual cost.`,
        likelyCause: `This ${word.one}'s creative or audience isn't working, while the others in the same campaign are.`,
        action: `Pause this ${word.one} and let the budget flow to the ${word.many} that produce ${def.resultLabel}.`,
        risk: "If it's brand new, give it a couple more days first.",
        recheckDays: 3, recheckRule: `The campaign's ${kpiShort(o, parent.mode)} should improve once this ${word.one} is off.`,
        evidence: [
          { label: "Spend", a: null, b: money(row.b.spend, currency) },
          { label: def.resultLabel, a: null, b: "0" },
          { label: `Campaign ${kpiShort(o, parent.mode)}`, a: null, b: fk(parent.kpiB, parent.mode, currency) },
        ],
      });
    }
  }

  // ---- strong performer: reuse what works (replaces the old "best performers") ----
  // Ads are compared with their siblings: the other ads in the same ad set, which
  // share its audience and budget (a creative test). Ad sets (when the export has
  // no ads) are compared with ad sets of the same objective and funnel role.
  const siblingKey = (r: CampaignRow) => r.info.parentId ?? `${r.info.campaignId}|${r.info.parentName}`;
  const bestPerCampaign = new Map<string, number>(); // ads: at most one "worth copying" per campaign
  for (const rows of [creativeRows]) {
    const groups = new Map<string, CampaignRow[]>();
    for (const r of rows) {
      if (r.b.spend <= 0 || r.kpiB === null || !resultsKnown(r) || isPaused(r)) continue;
      const k = hasAds ? `${siblingKey(r)}|${r.mode}` : `${r.info.objective}|${r.info.platform}|${r.mode}|${r.role}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const winners: { items: CampaignRow[]; best: { r: CampaignRow; others: Measures; kOthers: number | null; pi: number | null } }[] = [];
    for (const items of groups.values()) {
      if (items.length < (hasAds ? 2 : 3)) continue;
      const total = sumMeasures(items.map((r) => r.b));
      const scored = items
        .map((r) => {
          const others = sumMeasures(items.filter((x) => x !== r).map((x) => x.b));
          const kOthers = kpiValue(others, r.info.objective, r.mode);
          return { r, others, kOthers, pi: performanceIndex(r.kpiB, kOthers, r.mode) };
        })
        .filter(
          (x) =>
            x.pi !== null && x.r.b.spend >= total.spend * 0.05 && resultCount(x.r.b, x.r.info.objective) >= (hasAds ? 20 : 10) &&
            (!hasAds || significant(x.r.info.objective, x.r.mode, x.others, x.r.b)),
        )
        .sort((x, y) => y.pi! - x.pi!);
      const best = scored[0];
      if (!best || best.pi! < 1.3) continue;
      if (hasAds) {
        const c = best.r.info.campaignId ?? "";
        if ((bestPerCampaign.get(c) ?? 0) >= best.pi!) continue;
        bestPerCampaign.set(c, best.pi!);
      }
      winners.push({ items, best });
    }
    for (const { items, best } of winners) {
      if (hasAds && bestPerCampaign.get(best.r.info.campaignId ?? "") !== best.pi) continue;
      const r = best.r;
      const o = r.info.objective;
      const def = OBJECTIVE_DEFS[o];
      const word = LEVEL_WORD[r.level];
      const short = kpiShort(o, r.mode);
      const reasons = reasonsFor(o, r.mode, r.b, best.others, currency);
      const res = resultCount(r.b, o);
      const peers = hasAds
        ? `the other ${items.length === 2 ? "ad" : `${items.length - 1} ads`} in its ad set${r.info.parentName ? ` (${r.info.parentName})` : ""}`
        : `the other ${items.length - 1} ${word.many} with the same objective on ${PLATFORM_LABEL[r.info.platform]}`;
      out.push({
        row: r, objective: o, platform: r.info.platform,
        key: `strong:${r.level}:${r.info.id}`, detector: "strong_performer", actionType: "REUSE_WINNER", kind: "opportunity",
        confidence: res >= 20 ? "high" : "medium",
        rule: hasAds
          ? `Its ${short} is at least 30% better than ${peers} (statistically clear), with at least 20 ${def.resultLabel} and 5% of the ad set's spend. At most one ad per campaign.`
          : `Its ${short} is at least 30% better than ${peers}, with at least 10 ${def.resultLabel} and 5% of their spend.`,
        title: `${cap(word.one)} ${q(r.info.name)} gets ${def.resultLabel} ${advantage(best.pi!, r.mode)}${hasAds ? " than its siblings" : ""}`,
        whatHappened: `${q(r.info.name)} has a ${short} of ${fk(r.kpiB, r.mode, currency)} vs ${fk(best.kOthers, r.mode, currency)} for ${peers} (${advantage(best.pi!, r.mode)}).`,
        whyItMatters: "Doing more of what already works is the cheapest way to get more results.",
        likelyCause: reasons.length ? `Mainly ${reasons.map((x) => x.text).join("; ")}.` : "It performs better on every step from impression to result.",
        action: `${reasons[0] ? LESSON[reasons[0].key](word.one) : `Study what's different about this ${word.one}.`} Make 2–3 variations of it, and consider giving it a larger share of the budget.`,
        risk: "Winners fade too; keep testing new versions rather than relying on one ad.",
        recheckDays: 7, recheckRule: `The variations should get a ${short} close to ${fk(r.kpiB, r.mode, currency)}.`,
        evidence: [
          { label: short, a: null, b: fk(r.kpiB, r.mode, currency) },
          { label: hasAds ? "Other ads in its ad set" : `Other ${word.many}`, a: null, b: fk(best.kOthers, r.mode, currency) },
          { label: def.resultLabel, a: null, b: num(res, true) },
        ],
      });
    }
  }

  // ================= daily checks: tracking break =================
  if (a.coverage.hasDaily && recentDaily.length) {
    const end = a.selection.b.to;
    const byCamp = new Map<string, Map<string, Measures>>();
    for (const f of recentDaily) {
      const m = byCamp.get(f.campaignId) ?? new Map<string, Measures>();
      m.set(f.periodStart, sumMeasures([m.get(f.periodStart) ?? emptyMeasures(), f.measures]));
      byCamp.set(f.campaignId, m);
    }
    for (const row of a.campaigns) {
      const o = row.info.objective;
      if (!OBJECTIVE_DEFS[o].postClick || !resultsKnown(row)) continue;
      const days = byCamp.get(row.info.id);
      if (!days) continue;
      const last2 = [end, addDays(end, -1)].map((d) => days.get(d) ?? emptyMeasures());
      const base = Array.from({ length: 7 }, (_, i) => days.get(addDays(end, -2 - i)) ?? emptyMeasures());
      const baseResults = base.reduce((s, m) => s + resultCount(m, o), 0) / 7;
      const baseClicks = base.reduce((s, m) => s + m.linkClicks, 0) / 7;
      const lastResults = last2.reduce((s, m) => s + resultCount(m, o), 0);
      const lastClicks = last2.reduce((s, m) => s + m.linkClicks, 0) / 2;
      if (baseResults >= 3 && lastResults === 0 && baseClicks > 0 && lastClicks >= baseClicks * 0.5) {
        const def = OBJECTIVE_DEFS[o];
        out.push({
          row, objective: o, platform: row.info.platform,
          key: `tracking:${row.info.id}`, detector: "tracking_break", actionType: "FIX_TRACKING", kind: "problem", confidence: "high",
          urgent: { reason: "Tracking may be broken — until it's fixed, the platform optimises blind and every other number here is understated.", minShare: 0 },
          rule: `About 3 or more ${def.resultLabel} a day the week before, zero in the last 2 days, while clicks kept coming (at least half the usual number).`,
          title: `Check conversion tracking on ${q(row.info.name)}`,
          whatHappened: `${q(row.info.name)} recorded 0 ${def.resultLabel} on ${shortDate(addDays(end, -1))} and ${shortDate(end)}, after about ${num(baseResults)} a day the week before. Clicks are still coming in (${num(lastClicks)} a day).`,
          whyItMatters: "Until tracking works, the platform optimises blind and every other number here is understated.",
          likelyCause: "When clicks continue but results stop at zero, tracking is the most likely cause (pixel, conversions API, form integration).",
          action: `Test a ${def.resultSingular} yourself and check it appears in ${PLATFORM_LABEL[row.info.platform]}'s events.`,
          risk: "If the last day in your export was incomplete, this may be a false alarm — see the data notes.",
          recheckDays: 1, recheckRule: `${cap(def.resultLabel)} should reappear within a day of the fix.`,
          evidence: [
            { label: `${def.resultLabel} per day`, a: num(baseResults), b: "0" },
            { label: "Link clicks per day", a: num(baseClicks), b: num(lastClicks) },
          ],
        });
      }
    }
  }

  // ================= objective level: the KPI got clearly worse =================
  // Catches monthly flights, where each month runs new campaigns: no single
  // campaign is in both periods, but the objective as a whole got worse.
  for (const obj of a.objectives) {
    if (obj.kpiA === null || obj.kpiB === null || !obj.a || !obj.aRaw || obj.b.spend < a.totals.spendB * 0.1) continue;
    const pi = performanceIndex(obj.kpiB, obj.kpiA, obj.mode);
    if (pi === null || direction(pi, obj.mode) !== "worse") continue;
    if (out.some((c) => c.kind === "problem" && c.objective === obj.objective && c.row)) continue; // already explained per campaign
    const histDays = a.coverage.minDate && a.coverage.minDate < a.selection.b.from ? rangeDays(a.coverage.minDate, addDays(a.selection.b.from, -1)) : 0;
    const watch = worseUnconfirmed(obj.objective, obj.mode, obj.aRaw, obj.b, obj.history ? { m: obj.history, days: histDays } : null, obj.bMature, obj.kpiA);
    const def = OBJECTIVE_DEFS[obj.objective];
    const short = kpiShort(obj.objective, obj.mode);
    const d = mainDriver(obj.decomposition);
    const rows = a.campaigns.filter((r) => r.info.objective === obj.objective);
    const started = rows.filter((r) => r.isNew).map((r) => q(r.info.name));
    const stopped = rows.filter((r) => r.isStopped).map((r) => q(r.info.name));
    const fmtK = (v: number) => fk(v, obj.mode, currency);
    out.push({
      row: null, objective: obj.objective, platform: null,
      key: `objective_worse:${obj.objective}`, detector: "kpi_worsened", actionType: "INVESTIGATE", kind: "problem", confidence: watch ? "low" : obj.confidence,
      ...(watch ? { watchReason: watch } : {}),
      rule: `${short} for ${def.label.toLowerCase()} got at least ${Math.round(CHANGE_AT * 100)}% worse than ${cmpLabel} (statistically significant, and not contradicted by the longer history), and it has at least 10% of your spend.`,
      title: `${def.label}: ${short} got ${advantage(pi, obj.mode).replace("more expensive", "worse").replace("lower", "worse")} than ${cmpLabel}`,
      whatHappened: `Across your ${def.label.toLowerCase()} campaigns, ${short} went from ${fmtK(obj.kpiA)} to ${fmtK(obj.kpiB)} (${signedPct(obj.change)}) vs ${cmpLabel}.`,
      whyItMatters: obj.mode === "roas" ? "Each dollar of ads brings back less revenue than before." : `You're paying more for each ${def.resultSingular} than before.`,
      likelyCause: [
        d ? `Mainly because ${driverMeaning(d)} (${d.label} ${signedPct(d.change)}, ${pct(d.weight, 0)} of the movement).` : "The numbers don't point to one clear driver.",
        started.length || stopped.length ? "Different campaigns ran in the two periods, so their setup (audience, creative) may explain part of it." : "",
      ].filter(Boolean).join(" "),
      action: d ? DRIVER_ACTION[d.key] : "Compare the campaigns that ran in each period and look for what changed (audience, creative, offer).",
      risk: "Results differ between periods for many reasons (season, offer, audience); treat this as a lead, not a verdict.",
      recheckDays: 7, recheckRule: `${short} should move back toward ${fmtK(obj.kpiA)}.`,
      evidence: [
        { label: short, a: fmtK(obj.kpiA), b: fmtK(obj.kpiB) },
        ...(d ? [{ label: d.label, a: fmtDriver(d.key, d.a, currency), b: fmtDriver(d.key, d.b, currency) }] : []),
        { label: "Spend", a: money(obj.a.spend, currency), b: money(obj.b.spend, currency) },
      ],
      related: [
        ...(started.length ? [`Started this period: ${started.slice(0, 4).join(", ")}${started.length > 4 ? ` and ${started.length - 4} more` : ""}.`] : []),
        ...(stopped.length ? [`Ran only in ${cmpLabel}: ${stopped.slice(0, 4).join(", ")}${stopped.length > 4 ? ` and ${stopped.length - 4} more` : ""}.`] : []),
      ],
      stake: obj.b.spend,
      entityName: def.label,
      dataBasis: `${lenB} days · ${money(obj.b.spend, currency)} · ${num(obj.b.impressions, true)} impressions${obj.kpiMissing || obj.mode === "cpm" ? "" : ` · ${num(resultCount(obj.b, obj.objective), true)} ${def.resultLabel}`}${obj.aRaw && obj.mode !== "cpm" ? ` (vs ${num(resultCount(obj.aRaw, obj.objective), true)} in ${cmpLabel})` : ""}`,
    });
  }

  // ================= account level: cross-platform budget shift =================
  for (const obj of a.objectives) {
    const byPlat = new Map<Platform, Measures>();
    for (const r of a.campaigns.filter((r) => r.info.objective === obj.objective && r.b.spend > 0 && resultsKnown(r) && r.mode === obj.mode)) {
      byPlat.set(r.info.platform, sumMeasures([byPlat.get(r.info.platform) ?? emptyMeasures(), r.b]));
    }
    const plats = [...byPlat.entries()].filter(([, m]) => m.spend >= obj.b.spend * 0.1 && resultCount(m, obj.objective) >= 20);
    if (plats.length < 2 || obj.mode === "cpm") continue;
    if (obj.objective === "awareness" && plats.some(([p]) => p === "linkedin")) continue;
    const scored = plats
      .map(([p, m]) => ({ p, m, k: kpiValue(m, obj.objective, obj.mode) }))
      .filter((x): x is { p: Platform; m: Measures; k: number } => x.k !== null && x.k > 0)
      .sort((x, y) => (obj.mode === "roas" ? y.k - x.k : x.k - y.k));
    const best = scored[0];
    const worst = scored[scored.length - 1];
    if (!best || !worst || best.p === worst.p) continue;
    const ratio = obj.mode === "roas" ? best.k / worst.k : worst.k / best.k;
    if (ratio < 1.3) continue;
    const short = kpiShort(obj.objective, obj.mode);
    const def = OBJECTIVE_DEFS[obj.objective];
    out.push({
      row: null, objective: obj.objective, platform: best.p,
      key: `shift:${obj.objective}:${worst.p}->${best.p}`, detector: "cross_platform", actionType: "SHIFT_BUDGET", kind: "opportunity", confidence: "medium",
      rule: "The same objective runs on 2+ platforms, each with at least 10% of its spend and 20 results, and one is at least 30% more efficient.",
      title: `Test moving about 15% of ${def.label.toLowerCase()} budget from ${PLATFORM_LABEL[worst.p]} to ${PLATFORM_LABEL[best.p]}`,
      whatHappened: `For ${def.label.toLowerCase()}, ${PLATFORM_LABEL[best.p]} got a ${short} of ${fk(best.k, obj.mode, currency)} vs ${fk(worst.k, obj.mode, currency)} on ${PLATFORM_LABEL[worst.p]}.`,
      whyItMatters: `The same money currently buys more ${def.resultLabel} on ${PLATFORM_LABEL[best.p]}.`,
      likelyCause: `${PLATFORM_LABEL[best.p]}'s audience or format fits this goal better right now — but platforms count results differently, so part of the gap may be measurement.`,
      action: `Shift about 15% (${money(worst.m.spend * 0.15, currency)} of this period's ${PLATFORM_LABEL[worst.p]} spend) to your best ${PLATFORM_LABEL[best.p]} ${def.label.toLowerCase()} campaign, then compare again.`,
      risk: `Platforms use different attribution windows, and ${PLATFORM_LABEL[worst.p]} may reach people ${PLATFORM_LABEL[best.p]} can't.`,
      recheckDays: 7, recheckRule: `Keep the shift if ${PLATFORM_LABEL[best.p]}'s ${short} holds after the extra budget.`,
      evidence: scored.map((x) => ({ label: PLATFORM_LABEL[x.p], a: null, b: `${short} ${fk(x.k, obj.mode, currency)}` })),
      stake: worst.m.spend,
      entityName: `${PLATFORM_LABEL[worst.p]} → ${PLATFORM_LABEL[best.p]}`,
      dataBasis: `${lenB} days · ${scored.map((x) => `${PLATFORM_LABEL[x.p]}: ${money(x.m.spend, currency)}, ${num(resultCount(x.m, obj.objective), true)} ${def.resultLabel}`).join(" · ")}`,
    });
  }

  return finalize(a, dedupe(out), lenB);
}

// One finding per item. When several detectors fire on the same item, the one
// earliest in PRECEDENCE wins. A campaign-level creative or wasted-spend finding
// also covers the same issue on its own ads, so those aren't repeated.
function dedupe(list: Candidate[]): Candidate[] {
  const byEntity = new Map<string, Candidate>();
  const rest: Candidate[] = [];
  for (const cand of list) {
    if (!cand.row) {
      rest.push(cand);
      continue;
    }
    const id = `${cand.row.level}:${cand.row.info.id}`;
    const prev = byEntity.get(id);
    if (!prev || PRECEDENCE.indexOf(cand.detector) < PRECEDENCE.indexOf(prev.detector)) byEntity.set(id, cand);
  }
  const kept = [...byEntity.values()];
  const covered = new Set<string>();
  for (const k of kept) {
    if (k.row?.level !== "campaign") continue;
    if (k.detector === "creative_fatigue") covered.add(`ad_ctr_drop:${k.row.info.id}`);
    if (k.detector === "wasted_spend") covered.add(`zero_results_child:${k.row.info.id}`);
  }
  return [...kept.filter((k) => !(k.row && k.row.level !== "campaign" && covered.has(`${k.detector}:${k.row.info.campaignId}`))), ...rest];
}

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low", "monitor"];
const BUCKET_ORDER = ["attention", "opportunity", "monitor"];

// Attach money at stake, extra cost, data basis and priority, the same way for
// every detector (docs/product-plan.md §6).
function finalize(a: PartialAnalysis, list: Candidate[], lenB: number): Finding[] {
  const currency = a.workspace.currency;
  const total = a.totals.spendB;
  const campaignName = (id: string | undefined) => (id ? a.campaigns.find((r) => r.info.id === id)?.info.name ?? null : null);
  const findings = list.map((cand): Finding => {
    const row = cand.row;
    const stake = cand.stake ?? row?.b.spend ?? 0;
    const share = total > 0 ? stake / total : 0;
    const learningBlock = !!row?.learning && ["PAUSE", "REDUCE_BUDGET", "SCALE_BUDGET"].includes(cand.actionType);
    const low = cand.confidence === "low" && cand.actionType !== "FIX_TRACKING" && cand.actionType !== "CHECK_DELIVERY";

    let priority: Priority;
    let priorityReason: string;
    let action = cand.action;
    let actionType = cand.actionType;
    let basis = cand.dataBasis ?? (row ? dataBasis(a, row, lenB) : "");
    // Periods of different length: earlier amounts in the evidence are per-day scaled.
    if (a.selection.normalized && a.hasComparisonData && cand.evidence.some((e) => e.a !== null)) basis += ` · earlier-period amounts scaled to ${lenB} days`;
    if (learningBlock) {
      priority = "monitor";
      priorityReason = `It started on ${shortDate(row!.info.firstSeen)}, less than 7 days before the end of this period, so the platform may still be learning.`;
      action = `Wait until it has run for at least 7 days. If this still holds then: ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
      actionType = "WATCH";
    } else if (low && cand.watchReason) {
      priority = "monitor";
      priorityReason = `Not confirmed yet: ${cand.watchReason}. AdMate will flag it if it holds in the next period.`;
      action = `Keep watching. If it holds: ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
      actionType = "WATCH";
    } else if (low) {
      priority = "monitor";
      priorityReason = `Not enough data yet (${basis}) to act on. AdMate won't suggest pausing or scaling until there's more.`;
      action = `Keep watching. If it holds with more data: ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
      actionType = "WATCH";
    } else if (cand.fixedPriority) {
      ({ priority, reason: priorityReason } = cand.fixedPriority);
    } else if (cand.urgent && share >= cand.urgent.minShare) {
      priority = "high";
      priorityReason = cand.urgent.reason;
    } else if (cand.confidence === "high" && share >= 0.2) {
      priority = "high";
      priorityReason = `High confidence, and it carries ${pct(share, 0)} of your spend.`;
    } else if (share >= 0.05) {
      priority = "medium";
      priorityReason = `It carries ${pct(share, 0)} of your spend (${cand.confidence} confidence).`;
    } else {
      priority = "low";
      priorityReason = `It carries only ${pct(share, 0)} of your spend.`;
    }

    // Meta's learning phase needs about 50 optimization events a week.
    let risk = cand.risk;
    if (row && row.info.platform === "meta" && ["PAUSE", "REDUCE_BUDGET", "SCALE_BUDGET", "SHIFT_BUDGET"].includes(cand.actionType) && row.info.objective !== "awareness") {
      const weekly = (resultCount(row.b, row.info.objective) * 7) / lenB;
      if (weekly < 50) {
        risk += ` It gets fewer than 50 ${OBJECTIVE_DEFS[row.info.objective].resultLabel} a week (about ${num(weekly)}), so Meta may keep it in the learning phase; big budget changes can restart learning — change in small steps.`;
      }
    }

    const bucket = priority === "monitor" ? "monitor" : cand.kind === "problem" ? "attention" : "opportunity";
    return {
      key: cand.key,
      detector: cand.detector,
      actionType,
      bucket,
      priority,
      priorityReason,
      rule: cand.rule,
      confidence: cand.confidence,
      dataBasis: basis,
      objective: cand.objective,
      level: row?.level ?? "account",
      entityId: row?.info.id ?? null,
      entityName: row?.info.name ?? cand.entityName ?? null,
      parentName: row?.info.parentName ?? null,
      campaignId: row ? row.info.campaignId ?? row.info.id : null,
      campaignName: row ? (row.level === "campaign" ? row.info.name : campaignName(row.info.campaignId)) : null,
      platform: cand.platform,
      title: cand.title,
      whatHappened: cand.whatHappened,
      whyItMatters: cand.whyItMatters,
      likelyCause: cand.likelyCause,
      action,
      risk,
      recheckDays: cand.recheckDays,
      recheckRule: cand.recheckRule,
      evidence: cand.evidence,
      related: cand.related ?? [],
      moneyAtStake: stake,
      stakeShare: share,
      extraCost: cand.kind === "problem" && row && cand.confidence !== "low" ? extraCost(a, row, currency) : null,
      status: "todo",
      dismissReason: null,
    };
  });
  return findings.sort(
    (x, y) =>
      BUCKET_ORDER.indexOf(x.bucket) - BUCKET_ORDER.indexOf(y.bucket) ||
      PRIORITY_ORDER.indexOf(x.priority) - PRIORITY_ORDER.indexOf(y.priority) ||
      // Broken tracking first: every other number depends on it.
      Number(y.actionType === "FIX_TRACKING") - Number(x.actionType === "FIX_TRACKING") ||
      y.moneyAtStake - x.moneyAtStake,
  );
}

// "7 days · $1,240 · 48.2K impressions · 112 leads (vs 130 in Sep 15–21)"
export function dataBasis(a: PartialAnalysis, row: CampaignRow, lenB: number): string {
  const o = row.info.objective;
  const def = OBJECTIVE_DEFS[o];
  const parts = [`${lenB} day${lenB === 1 ? "" : "s"}`, money(row.b.spend, a.workspace.currency), `${num(row.b.impressions, true)} impressions`];
  const known = resultAvailable(row.availB, o);
  if (known) parts.push(`${num(resultCount(row.b, o), true)} ${def.resultLabel}`);
  let s = parts.join(" · ");
  if (known && row.aRaw && a.hasComparisonData && (row.availA ? resultAvailable(row.availA, o) : false)) {
    s += ` (vs ${num(resultCount(row.aRaw, o), true)} in ${a.selection.compareLabel})`;
  }
  return s;
}

// What the change cost, from actual numbers only: the same results at the
// comparison period's rate. No estimates, no multipliers.
function extraCost(a: PartialAnalysis, row: CampaignRow, currency: string): Finding["extraCost"] {
  if (!row.a || row.kpiA === null || row.kpiB === null) return null;
  const o = row.info.objective;
  const cmp = a.selection.compareLabel;
  // Worded as a worked sum, so the user can check it: money already spent, never a forecast.
  const after = "This already happened; it isn't a prediction.";
  if (row.mode === "roas") {
    const amount = row.b.spend * (row.kpiA - row.kpiB);
    return amount >= 1
      ? { amount, text: `You spent ${money(row.b.spend, currency)}. At ${cmp}'s ROAS of ${row.kpiA.toFixed(2)}× instead of ${row.kpiB.toFixed(2)}×, that spend would have brought ${money(amount, currency)} more revenue (${money(row.b.spend, currency)} × the ROAS gap). ${after}` }
      : null;
  }
  if (row.mode === "cpm") {
    const amount = (row.b.impressions * (row.kpiB - row.kpiA)) / 1000;
    return amount >= 1
      ? { amount, text: `You paid ${money(amount, currency)} more to show your ads than at ${cmp}'s price: ${num(row.b.impressions, true)} impressions at a CPM of ${money(row.kpiB, currency)} instead of ${money(row.kpiA, currency)}. ${after}` }
      : null;
  }
  const results = resultCount(row.b, o);
  const amount = (results * (row.kpiB - row.kpiA)) / (OBJECTIVE_DEFS[o].perThousand ? 1000 : 1);
  const label = OBJECTIVE_DEFS[o].resultLabel;
  return amount >= 1
    ? { amount, text: `You paid ${money(amount, currency)} more than you would have at ${cmp}'s cost: ${num(results, true)} ${label} at ${money(row.kpiB, currency)} each instead of ${money(row.kpiA, currency)} each. ${after}` }
    : null;
}
