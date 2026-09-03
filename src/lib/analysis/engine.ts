import type { NormalizedDailyRow } from "../tiktok/contract";

/**
 * DETERMINISTIC ANALYSIS ENGINE — the single source of truth.
 *
 * Code (never AI) owns:
 *   - all metrics and comparisons
 *   - the signal / status classification
 *   - priority / severity
 *   - evidence
 *   - confidence (High / Medium / Low) and its basis
 *
 * The AI layer receives this immutable result and may only add two narrative
 * fields (Possible Explanation, Recommended Action). It must never alter or
 * infer status, signal, evidence, metrics, severity or confidence.
 *
 * Comparison window: the latest 7 COMPLETE calendar days vs the 7 COMPLETE
 * calendar days immediately before them. Today is never included.
 */

export type Signal =
  | "cpa_deterioration"
  | "ctr_drop"
  | "creative_fatigue"
  | "scaling_efficiency"
  | "strong_improvement"
  | "stable"
  | "low_volume"
  | "tracking_issue"
  | "cpm_spike"
  | "insufficient_comparison";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "High" | "Medium" | "Low";

/**
 * STATUS is a separate, coarser layer than SIGNAL. Signal = what the numbers did.
 * Status = how the marketer should treat it. Both are code-owned; AI never assigns either.
 */
export type Status = "needs_attention" | "watch" | "stable" | "data_confidence";


export type MetricComparison = {
  label: string;
  current: string;
  previous: string;
  changePct: number | null;
  direction: "up" | "down" | "flat";
  /** true when the movement is the one that triggered the signal */
  primary?: boolean;
};

export type CampaignFinding = {
  campaignId: string;
  campaignName: string;
  signal: Signal;
  /** Human label for the SIGNAL (e.g. "CPA deterioration"). */
  signalLabel: string;
  /** Coded STATUS bucket derived from signal + severity. */
  status: Status;
  /** Human label for the STATUS (e.g. "Needs Attention"). */
  statusLabel: string;
  /** Deterministic one-line justification for the status assignment. */
  statusReason: string;
  severity: Severity;
  severityScore: number;
  needsAttention: boolean;

  headline: string;
  whatChanged: string;
  whyItMatters: string;
  confidence: Confidence;
  confidenceScore: number;
  confidenceBasis: string[];
  evidence: {
    currentWindow: string;
    previousWindow: string;
    method: string;
    metrics: MetricComparison[];
  };
  /** Snapshot for the campaign list view (current 7 complete days). */
  snapshot: {
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpa: number;
    cpm: number;
    roas: number;
    frequency: number;
  };
  /** Written by the AI layer only. */
  aiExplanation?: string;
  aiRecommendedAction?: string;
};

export type AnalysisResult = {
  currentWindow: { start: string; end: string };
  previousWindow: { start: string; end: string };
  totalSpend: number;
  generatedAt: string;
  findings: CampaignFinding[];
};

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  reach: number;
  budget: number;
  days: number;
};

const EMPTY: Totals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  reach: 0,
  budget: 0,
  days: 0,
};

function add(a: Totals, r: NormalizedDailyRow): Totals {
  return {
    spend: a.spend + r.spend,
    impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks,
    conversions: a.conversions + r.conversions,
    revenue: a.revenue + r.revenue,
    reach: a.reach + r.reach,
    budget: a.budget + r.dailyBudget,
    days: a.days + 1,
  };
}

const cpa = (t: Totals) => (t.conversions > 0 ? t.spend / t.conversions : Number.NaN);
const ctr = (t: Totals) => (t.impressions > 0 ? t.clicks / t.impressions : Number.NaN);
const cvr = (t: Totals) => (t.clicks > 0 ? t.conversions / t.clicks : Number.NaN);
const cpm = (t: Totals) => (t.impressions > 0 ? (t.spend / t.impressions) * 1000 : Number.NaN);
const cpc = (t: Totals) => (t.clicks > 0 ? t.spend / t.clicks : Number.NaN);
const roas = (t: Totals) => (t.spend > 0 ? t.revenue / t.spend : Number.NaN);
const frequency = (t: Totals) => (t.reach > 0 ? t.impressions / t.reach : Number.NaN);

function change(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

const money = (n: number) =>
  Number.isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "n/a";
const pctStr = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "n/a");
const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "n/a");
const ratio = (n: number) => (Number.isFinite(n) ? `${n.toFixed(2)}x` : "n/a");

function dir(changePct: number | null): "up" | "down" | "flat" {
  if (changePct === null) return "flat";
  if (changePct > 1) return "up";
  if (changePct < -1) return "down";
  return "flat";
}

/** Latest 7 complete days and the 7 complete days before them. Today excluded. */
function selectWindows(rows: NormalizedDailyRow[], windowDays: number) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = [...new Set(rows.map((r) => r.date))].filter((d) => d < today).sort();
  const current = dates.slice(-windowDays);
  const previous = dates.slice(-windowDays * 2, -windowDays);
  return { current, previous };
}

const SIGNAL_META: Record<Signal, { label: string; baseSeverity: Severity; attention: boolean }> = {
  tracking_issue: { label: "Possible tracking issue", baseSeverity: "critical", attention: true },
  cpa_deterioration: { label: "CPA deterioration", baseSeverity: "high", attention: true },
  cpm_spike: { label: "CPM spike", baseSeverity: "high", attention: true },
  creative_fatigue: { label: "Possible creative fatigue", baseSeverity: "high", attention: true },
  ctr_drop: { label: "CTR deterioration", baseSeverity: "medium", attention: true },
  scaling_efficiency: { label: "Scaling efficiency", baseSeverity: "medium", attention: false },
  strong_improvement: { label: "Strong improvement", baseSeverity: "info", attention: false },
  low_volume: { label: "Low volume", baseSeverity: "low", attention: false },
  insufficient_comparison: { label: "Insufficient comparison", baseSeverity: "low", attention: false },
  stable: { label: "Stable", baseSeverity: "info", attention: false },
};

/**
 * Ranking weight for confidence. Priority ordering is severity-dominant so that
 * high-severity Data Confidence warnings (e.g. tracking issues) are never hidden;
 * confidence only nudges ordering within/near a severity band. Status, Signal and
 * Confidence themselves remain independent, code-owned fields.
 */
const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  High: 0.6,
  Medium: 0.3,
  Low: 0,
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export const STATUS_LABEL: Record<Status, string> = {
  needs_attention: "Needs Attention",
  watch: "Watch",
  stable: "Stable",
  data_confidence: "Data Confidence",
};

/** Severity thresholds (%) above which a deterioration signal is treated as severe. */
const SEVERE_THRESHOLD: Partial<Record<Signal, number>> = {
  cpa_deterioration: 35,
  ctr_drop: 40,
};

/**
 * STATUS derivation — deterministic rules only, no hard-coded per-campaign labels.
 *   tracking_issue, low_volume        → Data Confidence (measurement/sample trust, not performance)
 *   creative_fatigue                  → Needs Attention
 *   cpa_deterioration / ctr_drop      → Needs Attention when severe, otherwise Watch
 *   cpm_spike, scaling_efficiency     → Watch
 *   strong_improvement, stable        → Stable
 */
function classifyStatus(
  signal: Signal,
  absChangePct: number,
  /** For ctr_drop only: whether a severe CTR decline is corroborated by worsening CPA/CVR. */
  ctrSupported = false,
): { status: Status; reason: string } {
  switch (signal) {
    case "tracking_issue":
      return {
        status: "data_confidence",
        reason: "The conversion collapse while clicks held may indicate a measurement issue, so the numbers are treated as unreliable before performance.",
      };
    case "low_volume":
      return {
        status: "data_confidence",
        reason: "Sample size is below the reliability threshold, so no performance verdict is issued.",
      };
    case "insufficient_comparison":
      return {
        status: "data_confidence",
        reason: "No comparable prior 7-day period (new or previously inactive campaign), so no change verdict can be issued yet.",
      };
    case "creative_fatigue":
      return {
        status: "needs_attention",
        reason: "Falling CTR with rising frequency and worsening CPA may indicate creative saturation, which tends to degrade further without action.",
      };
    case "ctr_drop": {
      const threshold = SEVERE_THRESHOLD.ctr_drop!;
      const severe = absChangePct >= threshold;
      // CTR-only decline stays a Watch; Needs Attention requires a SEVERE CTR
      // drop that is corroborated by worsening CPA/CVR.
      return severe && ctrSupported
        ? {
            status: "needs_attention",
            reason: `CTR fell ${absChangePct.toFixed(1)}% (>= ${threshold}% severe threshold) with worsening CPA/CVR confirming downstream impact.`,
          }
        : {
            status: "watch",
            reason: severe
              ? `CTR fell ${absChangePct.toFixed(1)}% but CPA/CVR have not worsened, so the click-through decline is not yet confirmed downstream — monitor.`
              : `CTR fell ${absChangePct.toFixed(1)}%, below the ${threshold}% severe threshold — monitor before acting.`,
          };
    }
    case "cpa_deterioration": {
      const threshold = SEVERE_THRESHOLD.cpa_deterioration!;
      const severe = absChangePct >= threshold;
      return severe
        ? {
            status: "needs_attention",
            reason: `Primary metric moved ${absChangePct.toFixed(1)}%, at or above the ${threshold}% severe threshold.`,
          }
        : {
            status: "watch",
            reason: `Primary metric moved ${absChangePct.toFixed(1)}%, below the ${threshold}% severe threshold — monitor before acting.`,
          };
    }
    case "cpm_spike":
      return {
        status: "watch",
        reason: "Auction cost rose but delivery efficiency has not broken; monitor whether it persists.",
      };
    case "scaling_efficiency":
      return {
        status: "watch",
        reason: "Spend is scaling without an efficiency penalty; monitor as budget increases.",
      };
    case "strong_improvement":
      return {
        status: "stable",
        reason: "Efficiency improved materially — positive, no corrective action required.",
      };
    case "stable":
    default:
      return {
        status: "stable",
        reason: "No monitored metric crossed a detection threshold.",
      };
  }
}


/** Severity: signal class, escalated by magnitude and spend exposure. Code-only. */
function classifySeverity(signal: Signal, absChangePct: number, spend: number): {
  severity: Severity;
  score: number;
} {
  const base = SIGNAL_META[signal].baseSeverity;
  const magnitude = Math.min(absChangePct / 50, 2);
  const exposure = Math.min(spend / 3000, 2);
  const score = Number((SEVERITY_RANK[base] + magnitude * 0.6 + exposure * 0.4).toFixed(3));
  let severity = base;
  if (SIGNAL_META[signal].attention) {
    if (score >= SEVERITY_RANK[base] + 1.4 && base === "high") severity = "critical";
    else if (score >= SEVERITY_RANK[base] + 1.4 && base === "medium") severity = "high";
  }
  return { severity, score };
}

/**
 * Deterministic confidence: volume/sample sufficiency, consistency of the
 * change across days, magnitude, and data completeness. Never AI-assigned.
 */
function classifyConfidence(input: {
  cur: Totals;
  prev: Totals;
  windowDays: number;
  absChangePct: number;
  dayLevelConsistency: number; // 0..1 share of days moving in the signal's direction
  signal: Signal;
}): { confidence: Confidence; score: number; basis: string[] } {
  const { cur, prev, windowDays, absChangePct, dayLevelConsistency, signal } = input;
  const basis: string[] = [];
  let score = 0;

  // 1. Volume / sample sufficiency
  const volume =
    cur.conversions >= 50 && cur.clicks >= 1000
      ? 1
      : cur.conversions >= 20 && cur.clicks >= 400
        ? 0.65
        : cur.conversions >= 5
          ? 0.35
          : 0.1;
  score += volume;
  basis.push(
    `Volume: ${cur.conversions} conversions and ${cur.clicks.toLocaleString("en-US")} clicks in the current window (${
      volume >= 1 ? "sufficient sample" : volume >= 0.65 ? "adequate sample" : "thin sample"
    }).`,
  );

  // 2. Consistency of the change across individual days
  score += dayLevelConsistency >= 0.85 ? 1 : dayLevelConsistency >= 0.6 ? 0.6 : 0.2;
  basis.push(
    `Consistency: ${Math.round(dayLevelConsistency * 100)}% of days in the current window moved in the same direction as the signal.`,
  );

  // 3. Magnitude relative to noise thresholds
  score += absChangePct >= 30 ? 1 : absChangePct >= 15 ? 0.6 : absChangePct >= 5 ? 0.3 : 0.1;
  basis.push(`Magnitude: primary metric moved ${absChangePct.toFixed(1)}% versus the prior window.`);

  // 4. Data completeness
  const completeness = (cur.days === windowDays ? 0.5 : 0) + (prev.days === windowDays ? 0.5 : 0);
  score += completeness;
  basis.push(
    `Data completeness: ${cur.days}/${windowDays} complete days current, ${prev.days}/${windowDays} complete days prior.`,
  );

  if (signal === "low_volume") {
    basis.push("Low-volume campaigns are capped at Low confidence by rule.");
    return { confidence: "Low", score: Number(score.toFixed(2)), basis };
  }

  if (signal === "tracking_issue") {
    basis.push("Possible tracking issues are capped at Low confidence by rule — the underlying data itself may be unreliable.");
    return { confidence: "Low", score: Number(score.toFixed(2)), basis };
  }

  if (signal === "insufficient_comparison") {
    basis.push("No comparable prior period, so any change is capped at Low confidence by rule.");
    return { confidence: "Low", score: Number(score.toFixed(2)), basis };
  }

  const confidence: Confidence = score >= 3.2 ? "High" : score >= 2.1 ? "Medium" : "Low";
  return { confidence, score: Number(score.toFixed(2)), basis };
}

/** Share of current-window days where the primary metric sits on the signal's side of the prior mean. */
function consistency(
  rows: NormalizedDailyRow[],
  currentDates: string[],
  previousMean: number,
  metricOf: (t: Totals) => number,
  expect: "higher" | "lower",
): number {
  const byDate = new Map<string, Totals>();
  for (const r of rows) byDate.set(r.date, add(byDate.get(r.date) ?? EMPTY, r));
  const values = currentDates
    .map((d) => byDate.get(d))
    .filter((t): t is Totals => Boolean(t))
    .map((t) => metricOf(t))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0 || !Number.isFinite(previousMean)) return 0;
  const matching = values.filter((v) => (expect === "higher" ? v > previousMean : v < previousMean));
  return matching.length / values.length;
}

/**
 * Average DAILY frequency across a window (mean of each day's impressions/reach),
 * NOT period impressions / summed daily reach — summing daily reach double-counts
 * users and distorts the ratio. This is an interim measure until a native TikTok
 * period-frequency (deduplicated reach) metric is available.
 */
function avgDailyFrequency(campRows: NormalizedDailyRow[], dateSet: Set<string>): number {
  const byDate = new Map<string, Totals>();
  for (const r of campRows) {
    if (dateSet.has(r.date)) byDate.set(r.date, add(byDate.get(r.date) ?? EMPTY, r));
  }
  const daily = [...byDate.values()]
    .map((t) => frequency(t))
    .filter((v) => Number.isFinite(v));
  if (daily.length === 0) return Number.NaN;
  return daily.reduce((a, b) => a + b, 0) / daily.length;
}

export function runAnalysis(rows: NormalizedDailyRow[], windowDays = 7): AnalysisResult {
  const { current, previous } = selectWindows(rows, windowDays);
  const curSet = new Set(current);
  const prevSet = new Set(previous);
  const currentWindow = { start: current[0] ?? "", end: current[current.length - 1] ?? "" };
  const previousWindow = { start: previous[0] ?? "", end: previous[previous.length - 1] ?? "" };
  const windowLabel = `${currentWindow.start} → ${currentWindow.end}`;
  const prevLabel = `${previousWindow.start} → ${previousWindow.end}`;

  const campaigns = new Map<string, { name: string; rows: NormalizedDailyRow[] }>();
  for (const r of rows) {
    const entry = campaigns.get(r.campaignId);
    if (entry) entry.rows.push(r);
    else campaigns.set(r.campaignId, { name: r.campaignName, rows: [r] });
  }

  const findings: CampaignFinding[] = [];
  let totalSpend = 0;

  for (const [campaignId, campaign] of campaigns) {
    const cur = campaign.rows.filter((r) => curSet.has(r.date)).reduce(add, EMPTY);
    const prev = campaign.rows.filter((r) => prevSet.has(r.date)).reduce(add, EMPTY);
    totalSpend += cur.spend;

    const dCpa = change(cpa(cur), cpa(prev));
    const dCtr = change(ctr(cur), ctr(prev));
    const dCvr = change(cvr(cur), cvr(prev));
    const dCpm = change(cpm(cur), cpm(prev));
    const dSpend = change(cur.spend, prev.spend);
    const dConv = change(cur.conversions, prev.conversions);
    const dClicks = change(cur.clicks, prev.clicks);
    const dRoas = change(roas(cur), roas(prev));
    // Frequency uses the average of daily frequencies, not period impressions /
    // summed daily reach (which double-counts users). See avgDailyFrequency.
    const freqCur = avgDailyFrequency(campaign.rows, curSet);
    const freqPrev = avgDailyFrequency(campaign.rows, prevSet);
    const dFreq = change(freqCur, freqPrev);

    // ---- Signal classification cascade (deterministic, order = priority) ----
    let signal: Signal;
    let primaryMetric = "CPA";
    let primaryChange = 0;
    let consistencyValue = 0;
    let headline: string;
    let whatChanged: string;
    let whyItMatters: string;

    // Sample-size floor is conversion-based only. Spend never affects
    // classification — it feeds priority/severity via `exposure` instead.
    const lowVolume = cur.conversions < 10;
    // No comparable prior period: new campaign, or one inactive last window.
    const noComparison = prev.days === 0 || prev.spend === 0 || prev.conversions === 0;
    const clicksHeld = dClicks !== null && dClicks > -20;
    const conversionsCollapsed = dConv !== null && dConv <= -50;

    if (lowVolume) {
      signal = "low_volume";
      primaryMetric = "Conversions";
      primaryChange = dConv ?? 0;
      consistencyValue = 0.5;
      headline = "Not enough volume to judge performance";
      whatChanged = `Only ${cur.conversions} conversions on ${money(cur.spend)} of spend in the current window (prior window: ${prev.conversions} conversions, ${money(prev.spend)}).`;
      whyItMatters =
        "Sample size is below the engine's reliability threshold, so metric movements here are statistically indistinguishable from noise.";
    } else if (noComparison) {
      signal = "insufficient_comparison";
      primaryMetric = "Spend";
      primaryChange = 0;
      consistencyValue = 0.5;
      headline = "No comparable prior period";
      whatChanged = `Current window: ${money(cur.spend)} of spend, ${cur.conversions} conversions. Prior window had no comparable activity (${money(prev.spend)} of spend, ${prev.conversions} conversions), so period-over-period change cannot be computed.`;
      whyItMatters =
        "This looks like a new or previously inactive campaign. Without a comparable prior 7-day baseline, any change figure would be misleading, so no performance verdict is issued yet.";
    } else if (clicksHeld && conversionsCollapsed) {
      signal = "tracking_issue";
      primaryMetric = "CVR";
      primaryChange = dCvr ?? 0;
      consistencyValue = consistency(campaign.rows, current, cvr(prev), cvr, "lower");
      headline = "Conversions collapsed while clicks held steady";
      whatChanged = `Clicks moved ${dClicks?.toFixed(1)}% (${num(prev.clicks)} → ${num(cur.clicks)}) but conversions fell ${dConv?.toFixed(1)}% (${prev.conversions} → ${cur.conversions}), taking CVR from ${pctStr(cvr(prev))} to ${pctStr(cvr(cur))}.`;
      whyItMatters =
        "Traffic volume is unchanged while recorded conversions are not, which may indicate a measurement/pixel issue rather than a real demand change. Spend continues either way.";
    } else if (
      dCtr !== null && dCtr <= -20 &&
      dFreq !== null && dFreq >= 15 &&
      dCpa !== null && dCpa > 0
    ) {
      signal = "creative_fatigue";
      primaryMetric = "CTR";
      primaryChange = dCtr;
      consistencyValue = consistency(campaign.rows, current, ctr(prev), ctr, "lower");
      headline = "CTR falling while frequency climbs and CPA worsens";
      whatChanged = `CTR fell from ${pctStr(ctr(prev))} to ${pctStr(ctr(cur))} (${dCtr.toFixed(1)}%), average daily frequency rose from ${num(freqPrev)} to ${num(freqCur)} (+${dFreq.toFixed(1)}%), and CPA worsened (+${dCpa.toFixed(1)}%).`;
      whyItMatters =
        "Falling response with rising frequency and worsening CPA may indicate creative fatigue — the same users may be seeing the creative more often and engaging less.";
    } else if (dCpa !== null && dCpa >= 20) {
      signal = "cpa_deterioration";
      primaryMetric = "CPA";
      primaryChange = dCpa;
      consistencyValue = consistency(campaign.rows, current, cpa(prev), cpa, "higher");
      headline = `Cost per result rose ${dCpa.toFixed(1)}%`;
      whatChanged = `CPA moved from ${money(cpa(prev))} to ${money(cpa(cur))} (+${dCpa.toFixed(1)}%), with CPC ${money(cpc(prev))} → ${money(cpc(cur))} and CVR ${pctStr(cvr(prev))} → ${pctStr(cvr(cur))}.`;
      whyItMatters = `${money(cur.spend)} of spend in the current window is buying results at a materially higher cost, compressing contribution margin.`;
    } else if (dCpm !== null && dCpm >= 25) {
      signal = "cpm_spike";
      primaryMetric = "CPM";
      primaryChange = dCpm;
      consistencyValue = consistency(campaign.rows, current, cpm(prev), cpm, "higher");
      headline = `CPM spiked ${dCpm.toFixed(1)}%`;
      whatChanged = `CPM rose from ${money(cpm(prev))} to ${money(cpm(cur))} (+${dCpm.toFixed(1)}%) while CTR moved ${dCtr === null ? "n/a" : `${dCtr.toFixed(1)}%`}.`;
      whyItMatters =
        "Media is simply more expensive to buy: at flat CTR the same budget delivers fewer clicks and fewer results.";
    } else if (dCtr !== null && dCtr <= -15) {
      signal = "ctr_drop";
      primaryMetric = "CTR";
      primaryChange = dCtr;
      consistencyValue = consistency(campaign.rows, current, ctr(prev), ctr, "lower");
      headline = `CTR dropped ${Math.abs(dCtr).toFixed(1)}%`;
      whatChanged = `CTR fell from ${pctStr(ctr(prev))} to ${pctStr(ctr(cur))} (${dCtr.toFixed(1)}%); frequency moved ${dFreq === null ? "n/a" : `${dFreq.toFixed(1)}%`}, so this alone does not confirm saturation.`;
      whyItMatters =
        "Weaker click-through raises effective CPC and reduces the volume this campaign can deliver at the same budget.";
    } else if (dSpend !== null && dSpend >= 25 && dCpa !== null && dCpa <= 5) {
      signal = "scaling_efficiency";
      primaryMetric = "Spend";
      primaryChange = dSpend;
      consistencyValue = consistency(campaign.rows, current, prev.spend / Math.max(1, prev.days), (t) => t.spend, "higher");
      headline = `Spend scaled ${dSpend.toFixed(1)}% with efficiency held`;
      whatChanged = `Spend rose from ${money(prev.spend)} to ${money(cur.spend)} (+${dSpend.toFixed(1)}%) while CPA moved only ${dCpa.toFixed(1)}% (${money(cpa(prev))} → ${money(cpa(cur))}).`;
      whyItMatters =
        "Additional budget is being absorbed without an efficiency penalty, which is the coded profile of remaining headroom.";
    } else if (
      // Genuine efficiency improvement: CPA down materially, OR ROAS up
      // materially — but never when CPA has worsened by more than +5%.
      !(dCpa !== null && dCpa > 5) &&
      ((dCpa !== null && dCpa <= -15) || (dRoas !== null && dRoas >= 20))
    ) {
      signal = "strong_improvement";
      primaryMetric = dCpa !== null && dCpa <= -15 ? "CPA" : "ROAS";
      primaryChange = dCpa !== null && dCpa <= -15 ? dCpa : (dRoas ?? 0);
      consistencyValue = consistency(campaign.rows, current, cpa(prev), cpa, "lower");
      headline = "Efficiency improved materially";
      whatChanged = `CPA moved ${money(cpa(prev))} → ${money(cpa(cur))} (${dCpa === null ? "n/a" : `${dCpa.toFixed(1)}%`}) and ROAS ${ratio(roas(prev))} → ${ratio(roas(cur))} (${dRoas === null ? "n/a" : `${dRoas.toFixed(1)}%`}).`;
      whyItMatters =
        "Results are getting cheaper at current budget, so this campaign is the strongest candidate for additional spend.";
    } else {
      signal = "stable";
      primaryMetric = "CPA";
      primaryChange = dCpa ?? 0;
      consistencyValue = 0.5;
      headline = "No material change detected";
      whatChanged = `All monitored metrics stayed inside threshold: CPA ${dCpa === null ? "n/a" : `${dCpa.toFixed(1)}%`}, CTR ${dCtr === null ? "n/a" : `${dCtr.toFixed(1)}%`}, CPM ${dCpm === null ? "n/a" : `${dCpm.toFixed(1)}%`}, spend ${dSpend === null ? "n/a" : `${dSpend.toFixed(1)}%`}.`;
      whyItMatters = "Nothing crossed a detection threshold, so no action is required for this campaign.";
    }

    const { severity, score } = classifySeverity(signal, Math.abs(primaryChange), cur.spend);
    const { confidence, score: confidenceScore, basis } = classifyConfidence({
      cur,
      prev,
      windowDays,
      absChangePct: Math.abs(primaryChange),
      dayLevelConsistency: consistencyValue,
      signal,
    });

    const metrics: MetricComparison[] = [
      {
        label: "Spend",
        current: money(cur.spend),
        previous: money(prev.spend),
        changePct: dSpend,
        direction: dir(dSpend),
        primary: primaryMetric === "Spend",
      },
      {
        label: "Cost per result (CPA)",
        current: money(cpa(cur)),
        previous: money(cpa(prev)),
        changePct: dCpa,
        direction: dir(dCpa),
        primary: primaryMetric === "CPA",
      },
      {
        label: "CTR",
        current: pctStr(ctr(cur)),
        previous: pctStr(ctr(prev)),
        changePct: dCtr,
        direction: dir(dCtr),
        primary: primaryMetric === "CTR",
      },
      {
        label: "CVR",
        current: pctStr(cvr(cur)),
        previous: pctStr(cvr(prev)),
        changePct: dCvr,
        direction: dir(dCvr),
        primary: primaryMetric === "CVR",
      },
      {
        label: "CPM",
        current: money(cpm(cur)),
        previous: money(cpm(prev)),
        changePct: dCpm,
        direction: dir(dCpm),
        primary: primaryMetric === "CPM",
      },
      {
        label: "CPC",
        current: money(cpc(cur)),
        previous: money(cpc(prev)),
        changePct: change(cpc(cur), cpc(prev)),
        direction: dir(change(cpc(cur), cpc(prev))),
      },
      {
        label: "Conversions",
        current: num(cur.conversions),
        previous: num(prev.conversions),
        changePct: dConv,
        direction: dir(dConv),
        primary: primaryMetric === "Conversions",
      },
      {
        label: "Clicks",
        current: num(cur.clicks),
        previous: num(prev.clicks),
        changePct: dClicks,
        direction: dir(dClicks),
      },
      {
        label: "Impressions",
        current: num(cur.impressions),
        previous: num(prev.impressions),
        changePct: change(cur.impressions, prev.impressions),
        direction: dir(change(cur.impressions, prev.impressions)),
      },
      {
        label: "Frequency (avg daily)",
        current: num(freqCur),
        previous: num(freqPrev),
        changePct: dFreq,
        direction: dir(dFreq),
      },
      {
        label: "ROAS",
        current: ratio(roas(cur)),
        previous: ratio(roas(prev)),
        changePct: dRoas,
        direction: dir(dRoas),
      },
    ];

    // A severe CTR decline only escalates to Needs Attention when CPA/CVR
    // confirm the click-through loss is hurting downstream results.
    const ctrSupported = (dCpa !== null && dCpa > 5) || (dCvr !== null && dCvr < -5);
    const { status, reason: statusReason } = classifyStatus(
      signal,
      Math.abs(primaryChange),
      ctrSupported,
    );

    findings.push({
      campaignId,
      campaignName: campaign.name,
      signal,
      signalLabel: SIGNAL_META[signal].label,
      status,
      statusLabel: STATUS_LABEL[status],
      statusReason,
      severity,
      severityScore: score,
      needsAttention: status === "needs_attention",

      headline,
      whatChanged,
      whyItMatters,
      confidence,
      confidenceScore,
      confidenceBasis: basis,
      evidence: {
        currentWindow: windowLabel,
        previousWindow: prevLabel,
        method: `Deterministic comparison of the latest ${windowDays} complete calendar days (${windowLabel}) against the preceding ${windowDays} complete calendar days (${prevLabel}). Signal thresholds: CPA >= +20% (severe >= +35%), CPM >= +25%, standalone CTR deterioration <= -15% (Watch; escalates to Needs Attention only when CTR fell >= 40% AND CPA/CVR also worsened), possible creative fatigue when CTR <= -20% AND avg daily frequency >= +15% AND CPA worsening, possible tracking issue when clicks > -20% while conversions <= -50% (confidence capped Low), scaling efficiency when spend >= +25% with CPA <= +5%, strong improvement when CPA <= -15% or ROAS >= +20% (never when CPA worsened > +5%), low volume below 10 conversions (spend affects priority only, not classification), insufficient comparison when there is no comparable prior period. Confidence contributes to ranking but not to Status, Signal or Confidence classification.`,
        metrics,
      },
      snapshot: {
        spend: Number(cur.spend.toFixed(2)),
        impressions: cur.impressions,
        clicks: cur.clicks,
        conversions: cur.conversions,
        ctr: Number.isFinite(ctr(cur)) ? Number((ctr(cur) * 100).toFixed(2)) : 0,
        cpa: Number.isFinite(cpa(cur)) ? Number(cpa(cur).toFixed(2)) : 0,
        cpm: Number.isFinite(cpm(cur)) ? Number(cpm(cur).toFixed(2)) : 0,
        roas: Number.isFinite(roas(cur)) ? Number(roas(cur).toFixed(2)) : 0,
        frequency: Number.isFinite(freqCur) ? Number(freqCur.toFixed(2)) : 0,
      },
    });
  }

  // Priority = severity-dominant, nudged by confidence. Severity stays the lead
  // term so high-severity Data Confidence warnings are never buried; confidence
  // only orders items of comparable severity. Status/Signal/Confidence unchanged.
  findings.sort(
    (a, b) =>
      b.severityScore + CONFIDENCE_WEIGHT[b.confidence] -
      (a.severityScore + CONFIDENCE_WEIGHT[a.confidence]),
  );

  return {
    currentWindow,
    previousWindow,
    totalSpend: Number(totalSpend.toFixed(2)),
    generatedAt: new Date().toISOString(),
    findings,
  };
}
