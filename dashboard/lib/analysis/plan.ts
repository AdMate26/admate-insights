import { rangeDays } from "../dates";
import { money, num, pct, rangeLabel } from "../format";
import { emptyMeasures, sumMeasures } from "../metrics/measures";
import { kpiAvailable } from "../metrics/availability";
import { kpiShort, kpiValue, OBJECTIVE_DEFS, resultCount, type KpiMode } from "../metrics/objectives";
import { isRunning } from "../ingest/normalize";
import { LEVEL_WORD, reasonsFor } from "./compare";
import { performanceIndex } from "./goals";
import { ROLE_LABEL } from "./roles";
import { CHANGE_AT, clearlyWorseThan, direction, holds, minus, significant, STRONG_ALPHA, worseBy, type Direction } from "./stability";
import { advantage } from "./wording";
import type { Measures } from "../metrics/measures";
import type { Analysis, CampaignRow, EntityLevel, Evidence, Finding, FindingStatus } from "./types";

// The action plan: one clear next step for EVERY campaign (or ad set / ad),
// whether or not a comparison period is selected.
//
//   High   — at least 20% better than expected (put more money in) or 20% worse
//            (cut or fix it), confirmed (stability.ts); clearly below
//            break-even; or a serious problem was detected.
//   Medium — meets expectations: within 20% of its target or its average.
//   Low    — learning, not enough data, or an early signal that isn't
//            confirmed yet ("watch": noise must not become budget advice).
//
// "Expected" is, in order (founder decision, kept in v3): the item's own past
// results (the comparison period, or everything uploaded before), your target
// (or break-even), then the average of your other campaigns with the same
// objective and funnel role. A "put more money in" call that still misses the
// target says so. Industry benchmarks for Cambodia would come last, once
// reliable ones exist (none are used today).

export type PlanPriority = "high" | "medium" | "low";
// "watch": it looks like scale/cut, but the change isn't confirmed yet (MRD §16.3).
export type PlanStance = "scale" | "cut" | "fix" | "keep" | "learn" | "wait" | "watch" | "reuse" | "avoid" | "average";

export interface Plan {
  key: string; // stable per item and stance: links the user's decision (in review / done / dismissed)
  row: CampaignRow;
  priority: PlanPriority;
  stance: PlanStance;
  label: string; // "Put more money in", "Cut or fix", "Keep running", …
  action: string;
  why: string;
  yardstick: string | null; // "your target ($1.20)", "your other messages campaigns ($0.85)"
  evidence: Evidence[];
  ended: boolean;
  findings: Finding[]; // open findings on this item (a campaign also gets its ad sets' and ads')
  // One-word verdict, the same everywhere (Campaigns table, cards, assistant).
  assessment: string;
  kind: "issue" | "opportunity" | "on_track" | "learning" | "waiting" | "signal";
  // What "expected" was, for the explanation.
  yardKind: "previous" | "history" | "target" | "break_even" | "others" | null;
  past: Measures | null; // its own past results used as the yardstick, if any
  yardValue: number | null;
  peers: Measures | null; // the other items combined (when compared with them)
  peerCount: number;
  // Who "the others" are: "your other leads campaigns", or for an ad "the other ads in its ad set (…)".
  peerName: string;
  peerIds: string[];
  status: FindingStatus;
  dismissReason: string | null;
  smallBudget?: boolean; // would be high, but it's under 5% of all spend
  // "Put more money in" while still missing the target: how far off (0.4 = 40% worse).
  targetGap: number | null;
  // Why a scale/cut call is only "watch" for now (null = confirmed or not applicable).
  unconfirmed: string | null;
  // The call it would make once confirmed (for "watch").
  pending: "scale" | "cut" | "reuse" | "avoid" | null;
}

export const ASSESSMENT: Record<PlanStance, { text: string; kind: Plan["kind"] }> = {
  scale: { text: "Better than expected", kind: "opportunity" },
  reuse: { text: "Better than expected", kind: "opportunity" },
  cut: { text: "Worse than expected", kind: "issue" },
  avoid: { text: "Worse than expected", kind: "issue" },
  fix: { text: "Problem found", kind: "issue" },
  keep: { text: "As expected", kind: "on_track" },
  average: { text: "As expected", kind: "on_track" },
  learn: { text: "Still learning", kind: "learning" },
  wait: { text: "Not enough data", kind: "waiting" },
  watch: { text: "Early signal", kind: "signal" },
};

const MIN_RESULTS = 10;
const SMALL_SHARE = 0.05; // under 5% of all spend: at most medium priority

const LABEL: Record<PlanStance, string> = {
  scale: "Put more money in",
  cut: "Cut or fix",
  fix: "Fix first",
  keep: "Keep running",
  learn: "Let it learn",
  wait: "Not enough data yet",
  watch: "Watch — not confirmed yet",
  reuse: "Reuse next time",
  avoid: "Don't repeat as is",
  average: "Average result",
};

const fk = (v: number | null, mode: KpiMode, cur: string) => (v === null ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v, cur));

// The ad set an ad belongs to (its parent id, or campaign + ad set name for older data).
const adSetKey = (x: CampaignRow) => x.info.parentId ?? `${x.info.campaignId}|${x.info.parentName}`;

export function computePlan(a: Analysis, level: EntityLevel = "campaign"): Plan[] {
  const cur = a.workspace.currency;
  const rows = level === "campaign" ? a.campaigns : a.byLevel[level];
  const word = LEVEL_WORD[level];
  const open = a.findings.filter((f) => f.status === "todo" || f.status === "in_review");
  const out: Plan[] = [];

  for (const r of rows) {
    if (r.b.spend <= 0) continue;
    const o = r.info.objective;
    const def = OBJECTIVE_DEFS[o];
    const short = kpiShort(o, r.mode);
    const ended = !isRunning(r.info.status);
    const findings = open.filter((f) => (level === "campaign" ? f.campaignId === r.info.id : f.entityId === r.info.id));
    const results = resultCount(r.b, o);

    // What "expected" means for this item. Campaigns and ad sets are compared with
    // others of the same funnel role (retargeting is structurally cheaper than
    // prospecting). An ad is compared with its siblings: the other ads in the same
    // ad set, which share its audience and budget, like a creative test.
    const isAd = level === "ad";
    const others = rows.filter(
      (x) => x !== r && x.info.objective === o && x.mode === r.mode && (isAd ? adSetKey(x) === adSetKey(r) : x.role === r.role) && x.b.spend > 0 && kpiAvailable(o, x.mode, x.availB),
    );
    const othersM = others.length ? sumMeasures(others.map((x) => x.b)) : emptyMeasures();
    const othersKpi = others.length && resultCount(othersM, o) > 0 ? kpiValue(othersM, o, r.mode) : null;
    const peerName = isAd
      ? `the other ${others.length === 1 ? "ad" : "ads"} in its ad set${r.info.parentName ? ` (${r.info.parentName})` : ""}`
      : `your other ${r.role === "prospecting" ? "" : `${ROLE_LABEL[r.role].toLowerCase()} `}${def.label.toLowerCase()} ${word.many}`;
    // Ads don't have their own budget: "put more money in" becomes "make more like it".
    const L = (s: PlanStance) => (isAd && s === "scale" ? "Make more like it" : isAd && s === "cut" ? "Pause or replace" : LABEL[s]);
    let yard: number | null = null;
    let yardName: string | null = null;
    let yardKind: Plan["yardKind"] = null;
    // Its own past results come first: the comparison period when one is
    // selected, otherwise everything uploaded before this period (if it has
    // enough results to be a fair yardstick).
    const hist = r.history;
    const histKpi =
      hist && kpiAvailable(o, r.mode, hist.avail) && (r.mode === "cpm" || resultCount(hist.m, o) >= MIN_RESULTS) ? kpiValue(hist.m, o, r.mode) : null;
    // The older history: everything before this period except the comparison
    // period itself, when it covers at least one more period of the same length.
    const lenA = a.selection.a ? rangeDays(a.selection.a.from, a.selection.a.to) : 0;
    const older = r.kpiA !== null && r.aRaw && hist && rangeDays(hist.from, hist.to) - lenA >= lenA ? minus(hist.m, r.aRaw) : null;
    const olderKpi = older && kpiAvailable(o, r.mode, hist!.avail) && (r.mode === "cpm" || resultCount(older, o) >= MIN_RESULTS) ? kpiValue(older, o, r.mode) : null;
    const olderLabel = `its own results before ${a.selection.compareLabel}`;
    // "Held two periods": this period and the previous one both differ from the
    // older history the same way (and the previous period doesn't contradict it).
    const dirB = olderKpi !== null ? direction(performanceIndex(r.kpiB, olderKpi, r.mode), r.mode) : null;
    const dirA = olderKpi !== null ? direction(performanceIndex(r.kpiA, olderKpi, r.mode), r.mode) : null;
    const dirPrev = direction(performanceIndex(r.kpiB, r.kpiA, r.mode), r.mode);
    // Each period must point the same way, and both together must be very clear.
    const heldTwo =
      !ended && dirB !== null && dirB === dirA && (dirPrev === null || dirPrev === dirB) &&
      holds(o, r.mode, older!, r.b, dirB) && holds(o, r.mode, older!, r.aRaw!, dirB) &&
      holds(o, r.mode, older!, sumMeasures([r.b, r.aRaw!]), dirB, STRONG_ALPHA);
    if (isAd && othersKpi !== null && resultCount(othersM, o) >= MIN_RESULTS) {
      // An ad is judged against its siblings first, in the same period.
      yard = othersKpi;
      yardName = peerName;
      yardKind = "others";
    } else if (r.kpiA !== null && heldTwo) {
      yard = olderKpi;
      yardName = olderLabel;
      yardKind = "history";
    } else if (r.kpiA !== null) {
      yard = r.kpiA;
      yardName = `its own results in ${a.selection.compareLabel}`;
      yardKind = "previous";
    } else if (histKpi !== null && hist) {
      yard = histKpi;
      yardName = `its own past results (${rangeLabel(hist.from, hist.to)})`;
      yardKind = "history";
    } else if (r.goal) {
      yard = r.goal.value;
      yardName = r.goal.source === "target" ? "your target" : "your break-even";
      yardKind = r.goal.source === "target" ? "target" : "break_even";
    } else if (othersKpi !== null) {
      yard = othersKpi;
      yardName = peerName;
      yardKind = "others";
    }
    let yardText = yard !== null ? `${yardName} (${fk(yard, r.mode, cur)})` : null;
    // The past results used as the yardstick (for "why" explanations).
    const pastM = yardKind === "previous" ? r.a : yardKind === "history" ? (heldTwo ? older : hist?.m ?? null) : null;
    const pi = performanceIndex(r.kpiB, yard, r.mode);
    const kpiText = `${short} ${fk(r.kpiB, r.mode, cur)}`;
    const evidence: Evidence[] = [
      { label: short, a: r.kpiA !== null ? fk(r.kpiA, r.mode, cur) : null, b: fk(r.kpiB, r.mode, cur) },
      ...(yard !== null ? [{ label: yardName!.replace(/^your /, "").replace(/^its own /, "").replace(/^./, (c) => c.toUpperCase()), a: null, b: fk(yard, r.mode, cur) }] : []),
      { label: "Spend", a: null, b: money(r.b.spend, cur) },
      ...(kpiAvailable(o, r.mode, r.availB) && r.mode !== "cpm" ? [{ label: def.resultLabel, a: null, b: num(results, true) }] : []),
    ];
    const plan = (priority: PlanPriority, stance: PlanStance, action: string, why: string): Plan => ({
      key: `plan:${level}:${r.info.id}:${stance}`,
      row: r, priority, stance, label: L(stance), action, why, yardstick: yardText, evidence, ended, findings,
      assessment: ASSESSMENT[stance].text, kind: ASSESSMENT[stance].kind,
      yardKind, yardValue: yard, peers: others.length ? othersM : null, peerCount: others.length,
      peerName, peerIds: others.map((x) => x.info.id),
      past: pastM,
      status: "todo", dismissReason: null,
      targetGap: null, unconfirmed: null, pending: null,
    });
    const singleDay = rangeDays(a.selection.b.from, a.selection.b.to) === 1;
    // Is a "better"/"worse" call real and lasting? Returns why not, or null when
    // confirmed (MRD §16.3, stability.ts): held two periods, or sudden and very
    // clear against the older history; a drop must also show on the days whose
    // conversions are complete.
    const chance = `the difference could still be chance at this volume (${r.mode === "cpm" ? `${num(r.b.impressions, true)} impressions` : `${num(results)} ${def.resultLabel}`})`;
    const notConfirmed = (dir: Direction): string | null => {
      if (singleDay) return "a single day is too noisy to act on";
      if (!heldTwo) {
        if (yardKind === "previous" && !ended) {
          if (!significant(o, r.mode, r.aRaw!, r.b)) return chance;
          if (olderKpi === null) return "there is only one earlier period to compare with, so AdMate can't yet tell a lasting change from a one-off";
          if (!holds(o, r.mode, older!, r.b, dir, STRONG_ALPHA)) {
            return `against its older results (${fk(olderKpi, r.mode, cur)}) the change isn't clear yet, so ${a.selection.compareLabel} may have been unusual. If it holds next period, AdMate will call it`;
          }
        } else if (yardKind === "history" && hist) {
          if (!significant(o, r.mode, hist.m, r.b, STRONG_ALPHA)) return chance;
        } else {
          const base = yardKind === "previous" ? r.aRaw : yardKind === "others" ? othersM : null;
          if (base && !significant(o, r.mode, base, r.b)) return chance;
        }
      }
      if (dir === "worse" && r.bMature && def.postClick) {
        const mature = r.mode === "cpm" || resultCount(r.bMature, o) >= MIN_RESULTS ? kpiValue(r.bMature, o, r.mode) : null;
        if (direction(performanceIndex(mature, yard, r.mode), r.mode) !== "worse") return "most of the drop is in the last few days, whose results may still grow";
      }
      return null;
    };
    // Why it's better/worse than the others (CPM, CTR, conversion rate…), when that's the yardstick.
    const because = (better: boolean) => {
      const base = yardKind === "others" ? othersM : pastM;
      if (!base) return "";
      const [w, l] = better ? [r.b, base] : [base, r.b];
      const rs = reasonsFor(o, r.mode, w, l, cur, 1);
      const them = yardKind === "others" ? "the others have " : "before, it had ";
      return rs.length ? ` Mainly: ${better ? "" : them}${rs[0].text}.` : "";
    };

    let p: Plan;
    if (!kpiAvailable(o, r.mode, r.availB)) {
      p = plan("low", "wait", `Can't be judged: your export has no ${def.resultLabel} column. Re-export with the Results column.`, "The result column is missing from the uploaded file.");
    } else if (r.learning && !ended) {
      p = plan(
        "low",
        "learn",
        "Let it learn: don't change the budget, audience or ads for now. Judge it after 7 days (Meta needs about 50 results a week to finish learning).",
        r.info.status === "learning" ? "The platform reports it's still in the learning phase." : "It started less than 7 days before the end of this period, so the platform is still learning.",
      );
    } else if (results === 0 && r.mode !== "cpm") {
      // ROAS campaigns have no cost-per-result yardstick: a real share of the budget with no sales is enough.
      // Zero results is waste whatever the funnel role: without another yardstick,
      // use the other campaigns with this objective, all roles together.
      // (For an ad: its siblings in the ad set.)
      const anyRole = isAd ? others : rows.filter((x) => x !== r && x.info.objective === o && x.mode === r.mode && x.b.spend > 0 && kpiAvailable(o, x.mode, x.availB));
      const anyRoleM = sumMeasures(anyRole.map((x) => x.b));
      if (yard === null && anyRole.length && resultCount(anyRoleM, o) > 0) {
        yard = kpiValue(anyRoleM, o, r.mode);
        yardName = isAd ? peerName : `your other ${def.label.toLowerCase()} ${word.many}`;
        yardKind = "others";
      }
      const zeroYardText = yard !== null ? `${yardName} (${fk(yard, r.mode, cur)})` : null;
      yardText = zeroYardText;
      const wasted = r.mode === "roas" ? r.spendShare >= 0.1 : yard !== null && r.b.spend >= 2 * yard;
      if (wasted && r.mode === "roas") {
        p = ended
          ? plan("high", "avoid", "Don't run this setup again without changing the audience or offer.", `It spent ${money(r.b.spend, cur)} (${pct(r.spendShare, 0)} of this objective) with no ${def.resultLabel}.`)
          : plan("high", "cut", isAd ? `Pause this ad, and first check its ${def.resultLabel} are tracked.` : `Pause it or cut its budget, and first check its ${def.resultLabel} are tracked.`, `It spent ${money(r.b.spend, cur)} (${pct(r.spendShare, 0)} of this objective) with no ${def.resultLabel}.`);
      } else if (wasted && yard !== null) {
        p = ended
          ? plan("high", "avoid", `Don't run this setup again without changing the audience or offer.`, `It spent ${money(r.b.spend, cur)} with no ${def.resultLabel} — ${(r.b.spend / yard).toFixed(1)}× what one ${def.resultSingular} costs vs ${zeroYardText}.`)
          : plan(
              "high",
              "cut",
              isAd ? `Pause this ad so the ad set's budget goes to ${peerName}, and first check its ${def.resultLabel} are tracked.` : `Pause it or cut its budget, and first check its ${def.resultLabel} are tracked.`,
              `It spent ${money(r.b.spend, cur)} with no ${def.resultLabel} — ${(r.b.spend / yard).toFixed(1)}× what one ${def.resultSingular} costs vs ${zeroYardText}.`,
            );
      } else {
        p = plan("low", "wait", `Give it a little longer before judging.`, `${money(r.b.spend, cur)} spent and no ${def.resultLabel} yet — too little spend to say it isn't working.`);
      }
    } else if (r.mode !== "cpm" && results < MIN_RESULTS) {
      p = plan("low", "wait", `Wait for more data before changing anything (aim for at least ${MIN_RESULTS} ${def.resultLabel}).`, `Only ${num(results)} ${def.resultLabel} so far (${kpiText}), too few to judge fairly.`);
    } else if (pi === null) {
      p = plan(
        "medium",
        ended ? "average" : "keep",
        ended ? "No yardstick to judge it by. Set a target so AdMate can tell you whether to reuse it." : "Keep it running. Set a target (Targets & settings) so AdMate can tell you whether to put more money in.",
        `${kpiText}. There is no target, no other ${def.label.toLowerCase()} ${word.one} and no earlier period to compare it with.`,
      );
    } else {
      // Below break-even is a hard line, but only when it's clearly below, not by
      // chance at this volume. Just under it adds a note instead of a cut.
      const underBreakEven = r.breakEven !== null && performanceIndex(r.kpiB, r.breakEven, r.mode)! < 1;
      const belowBreakEven = underBreakEven && clearlyWorseThan(o, r.mode, r.b, r.breakEven!);
      const nearBreakEven = underBreakEven && !belowBreakEven ? ` It's just under break-even (${fk(r.breakEven, r.mode, cur)}), within normal ups and downs at this volume; keep an eye on it.` : "";
      const vs = `${kpiText} vs ${yardText}: ${advantage(pi, r.mode)}.${nearBreakEven}`;
      // One definition of "20% better / worse", the same one the card prints.
      const dir = direction(pi, r.mode);
      if (belowBreakEven) {
        p = ended
          ? plan("high", "avoid", "Don't repeat this setup: it lost money.", `${kpiText} is below break-even (${fk(r.breakEven, r.mode, cur)}).`)
          : plan(
              "high",
              "cut",
              isAd ? "Pause or replace this ad: it loses money at this cost per result." : "Cut its budget by 20–30% now, and fix the weakest part (see why) before spending more.",
              `${kpiText} is below break-even (${fk(r.breakEven, r.mode, cur)}) — every extra dollar loses money.`,
            );
      } else if (dir === "better") {
        p = ended
          ? plan("high", "reuse", `Start the next ${def.label.toLowerCase()} flight from this ${word.one} and give it a bigger share of the budget.`, vs + because(true))
          : isAd
            ? plan("high", "scale", `Keep it running and make 2–3 new versions of it (same idea, new hook or visual). To give it more of the ad set's budget, pause the weakest of ${peerName}.`, vs + because(true))
            : plan("high", "scale", `Put more money in: raise its budget by about 20%${r.info.budget ? ` (${money(r.info.budget, cur)} → ${money(r.info.budget * 1.2, cur)})` : ""}, then wait 3–4 days before raising again.`, vs + because(true));
      } else if (dir === "worse") {
        p = ended
          ? plan("high", "avoid", `Don't repeat this setup as is: change the audience or creative first, or move its budget to the better ${word.many}.`, vs + because(false))
          : isAd
            ? plan("high", "cut", `Pause this ad or replace it with a new version (new hook or first 3 seconds). The ad set's budget then goes to ${peerName}.`, vs + because(false))
            : plan("high", "cut", `Cut its budget by 20–30% and move the money to your better ${word.many}, or fix the weak step (see why).`, vs + because(false));
      } else {
        p = ended
          ? plan("medium", "average", "Fine to reuse, with fresh creative to push it above average.", vs)
          : plan(
              "medium",
              "keep",
              isAd ? "Keep it running. To improve it, test a new hook or first 3 seconds next to it." : "Keep the budget as it is. To improve it, test one new creative or audience at a time.",
              `${vs} That's within ${Math.round(CHANGE_AT * 100)}% of what's expected.`,
            );
      }
      // Low confidence on a strong call: say so, don't act on it yet.
      if (p.priority === "high" && r.confidence === "low" && (p.stance === "scale" || p.stance === "cut")) {
        p = { ...plan("low", "wait", `Looks like "${L(p.stance).toLowerCase()}", but wait for more data before acting.`, `${vs} Based on little data (${num(results)} ${def.resultLabel}).`) };
      }
      // Fewer, later, reliable: a scale/cut call must be confirmed (break-even is a hard line).
      const call = p.stance;
      if (dir && !belowBreakEven && (call === "scale" || call === "cut" || call === "reuse" || call === "avoid")) {
        const why = notConfirmed(dir);
        if (why) {
          p = {
            ...plan("low", "watch", `Looks like "${L(call).toLowerCase()}", but it isn't confirmed yet. Keep it unchanged and re-check after the next period.`, `${vs} Not confirmed yet: ${why}.`),
            unconfirmed: why,
            pending: call,
          };
        }
      }
      // Past-first judging (founder decision): a "put more money in" call can come
      // from beating its own past while still missing the target. Say so plainly.
      if (p.stance === "scale" && r.goal) {
        const pg = performanceIndex(r.kpiB, r.goal.value, r.mode);
        if (pg !== null && pg < 1) {
          const goalName = r.goal.source === "target" ? "your target" : "break-even";
          p = {
            ...p,
            targetGap: worseBy(pg, r.mode),
            why: `${p.why} Still ${advantage(pg, r.mode)} than ${goalName} (${fk(r.goal.value, r.mode, cur)}): improving, not yet on target.`,
            evidence: [...p.evidence, { label: r.goal.source === "target" ? "Target" : "Break-even", a: null, b: fk(r.goal.value, r.mode, cur) }],
          };
        }
      }
    }
    // Single days are for exploring only: no budget calls from one day of data.
    if (singleDay && (p.stance === "scale" || p.stance === "cut" || p.stance === "reuse" || p.stance === "avoid")) {
      p = {
        ...plan("low", "watch", `One day of data can't support a budget change. Look at a 7-day or longer period before acting.`, `${p.why} Not confirmed yet: a single day is too noisy to act on.`),
        unconfirmed: "a single day is too noisy to act on",
        pending: p.stance,
      };
    }

    // A detected problem on this item comes first, and its priority is the item's
    // priority, so Alerts and Recommendations never disagree (MRD FR-02). A
    // diagnosis (tracking, landing page, creative, ad costs…) beats generic budget
    // advice; a budget finding that agrees with a "cut" plan just adds its evidence.
    // Problems on a single ad or ad set only take over the whole campaign when
    // they matter (high, or medium on a campaign that isn't an opportunity).
    const problem = findings.find(
      (f) => f.bucket === "attention" && (f.entityId === r.info.id || f.priority === "high" || (f.priority === "medium" && p.kind !== "opportunity")),
    );
    const budgetOnly = problem && ["REDUCE_BUDGET", "PAUSE", "SHIFT_BUDGET"].includes(problem.actionType);
    if (problem && !ended && !(p.stance === "cut" && budgetOnly)) {
      p = {
        ...p, key: `plan:${level}:${r.info.id}:fix`, priority: problem.priority === "high" ? "high" : problem.priority === "medium" ? "medium" : "low", stance: "fix", label: LABEL.fix,
        assessment: ASSESSMENT.fix.text, kind: ASSESSMENT.fix.kind, action: problem.action, why: `${problem.whatHappened} (${p.why})`,
        targetGap: null, unconfirmed: null, pending: null,
      };
    }
    // "Ranked by money, not by drama": a big difference on a tiny budget is Medium, not High.
    const shareOfAll = a.totals.spendB > 0 ? r.b.spend / a.totals.spendB : 0;
    if (p.priority === "high" && p.stance !== "fix" && shareOfAll < SMALL_SHARE) {
      p = { ...p, priority: "medium", smallBudget: true };
    }
    const d = a.decisions?.[p.key];
    if (d) {
      p.status = d.status;
      p.dismissReason = d.dismissReason;
    }
    out.push(p);
  }

  const P: PlanPriority[] = ["high", "medium", "low"];
  // Within a priority: broken tracking first (every other number depends on it), then
  // other detected problems, then running before ended campaigns, then by spend.
  const rank = (p: Plan) => (p.stance === "fix" ? (p.findings.some((f) => f.actionType === "FIX_TRACKING") ? 0 : 1) : 2);
  return out.sort((x, y) => P.indexOf(x.priority) - P.indexOf(y.priority) || rank(x) - rank(y) || Number(x.ended) - Number(y.ended) || y.row.b.spend - x.row.b.spend);
}

// Still to act on (not done or dismissed).
export const isOpen = (p: { status: FindingStatus }) => p.status === "todo" || p.status === "in_review";

// Share of spend, for display.
export const spendShare = (a: Analysis, p: Plan) => pct(a.totals.spendB > 0 ? p.row.b.spend / a.totals.spendB : 0, 0);
