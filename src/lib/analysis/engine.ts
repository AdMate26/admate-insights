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
  | "insufficient_comparison"
  // Google Ads — Search: visibility limited by budget or Ad Rank (lost impression share).
  | "lost_impression_share";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "High" | "Medium" | "Low";

/**
 * STATUS is a separate, coarser layer than SIGNAL. Signal = what the numbers did.
 * Status = how the marketer should treat it. Both are code-owned; AI never assigns either.
 */
export type Status = "needs_attention" | "watch" | "stable" | "data_confidence";

/**
 * PERFORMANCE RATING — a simple, customer-facing verdict derived from the
 * numeric Performance Score. Unlike Status, it never exposes internal buckets
 * like "Watch" or "Data Confidence". Code-owned; AI never assigns it.
 *
 *   85–100 = Very Good · 70–84 = Good · 50–69 = Fair · 0–49 = Needs Attention
 */
export type PerformanceRating = "Very Good" | "Good" | "Fair" | "Needs Attention";

/** Signals for which NO performance score is issued — the UI shows "Check Data". */
export const NO_SCORE_SIGNALS: ReadonlySet<Signal> = new Set<Signal>([
  "tracking_issue",
  "low_volume",
  "insufficient_comparison",
]);

/** Map a 0–100 Performance Score to its rating band. */
export function performanceRatingFor(score: number): PerformanceRating {
  if (score >= 85) return "Very Good";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs Attention";
}

/**
 * Customer-facing performance label. Uses the rating when a score exists;
 * otherwise low volume reads "Early Data" (we have the data, just not enough
 * results yet) while other no-score signals read "Check Data".
 */
export function performanceLabelFor(
  signal: Signal,
  rating: PerformanceRating | null,
): string {
  if (rating) return rating;
  if (signal === "low_volume") return "Early Data";
  return "Check Data";
}

/**
 * Deterministic, code-owned UX guidance for the data-confidence signals
 * (low volume / tracking issue). This is plain-language help text only — it does
 * NOT affect score, rating, signal, confidence or priority, and the AI layer is
 * untouched. Returns null for signals that use the normal AI recommendation.
 */
export type DataConfidenceGuidance = {
  /** Optional plain-language read on current direction. */
  directionNote?: string;
  /** Recommended next action in simple wording. */
  action: string;
  /** Optional ordered steps the user can follow. */
  steps?: string[];
};

export function dataConfidenceGuidanceFor(
  signal: Signal,
  /** Platform noun used in the tracking steps (e.g. "TikTok", "Meta", "Google"). */
  platformNoun = "TikTok",
): DataConfidenceGuidance | null {
  if (signal === "low_volume") {
    return {
      directionNote: "No major issue detected yet.",
      action: "Continue collecting results before making a major optimization.",
    };
  }
  if (signal === "tracking_issue") {
    return {
      action: "Verify conversion tracking before changing budget, targeting or creative.",
      steps: [
        `Compare ${platformNoun} conversions with your actual orders or leads.`,
        `If they do not match, check whether the ${platformNoun} conversion tracking (pixel / conversion event) is recording correctly.`,
        "If needed, ask your website or technical team to verify tracking.",
        "If the numbers match, treat the drop as a real campaign-performance issue and review the campaign.",
      ],
    };
  }
  return null;
}

/**
 * CAMPAIGN TIMING — informational only. Never affects score, rating, signal,
 * confidence, priority or recommendations. Derived from the campaign's start/end
 * dates for display in the overview and detail views.
 */
export type CampaignTiming = {
  startDate: string | null;
  endDate: string | null;
  /** Whole days from today until the end date; null when there is no end date. */
  daysRemaining: number | null;
  /** Compact display string, e.g. "Ends Sep 18 · 13 days left", "Ongoing · No end date". */
  label: string;
};

function formatShortDate(iso: string): string {
  // Parse as UTC noon to avoid timezone slippage on the date boundary.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Build the display-only timing summary. `todayIso` is injectable for testing;
 * it defaults to the current UTC date.
 */
export function computeTiming(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  todayIso: string = new Date().toISOString().slice(0, 10),
): CampaignTiming {
  const start = startDate ?? null;
  const end = endDate ?? null;

  // Not started yet takes precedence.
  if (start && start > todayIso) {
    return { startDate: start, endDate: end, daysRemaining: null, label: `Starts ${formatShortDate(start)}` };
  }

  if (end) {
    const remaining = daysBetween(todayIso, end);
    if (remaining < 0) {
      return { startDate: start, endDate: end, daysRemaining: remaining, label: `Ended ${formatShortDate(end)}` };
    }
    if (remaining === 0) {
      return { startDate: start, endDate: end, daysRemaining: 0, label: "Ends Today" };
    }
    if (remaining === 1) {
      return { startDate: start, endDate: end, daysRemaining: 1, label: "Ends Tomorrow" };
    }
    return {
      startDate: start,
      endDate: end,
      daysRemaining: remaining,
      label: `Ends ${formatShortDate(end)} · ${remaining} days left`,
    };
  }

  return { startDate: start, endDate: end, daysRemaining: null, label: "Ongoing · No end date" };
}


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
  /**
   * Deterministic Performance Score (0–100), or null when no verdict is issued
   * (tracking_issue / low_volume / insufficient_comparison → "Check Data").
   * Computed by code from the signal and the PERFORMANCE change only — spend and
   * confidence never move it.
   */
  performanceScore: number | null;
  /** Customer-facing rating for the score, or null when there is no score. */
  performanceRating: PerformanceRating | null;
  /**
   * Customer-facing label shown even when there is no score: the rating when a
   * score exists, "Early Data" for low volume, "Check Data" for other no-score
   * signals. Display-only; never affects classification.
   */
  performanceLabel: string;
  /**
   * Deterministic plain-language guidance for data-confidence signals
   * (low volume / tracking issue); null otherwise. Does not affect any scoring.
   */
  guidance: DataConfidenceGuidance | null;
  /** Informational campaign timing (display-only; never affects analysis). */
  timing: CampaignTiming;
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
  lost_impression_share: { label: "Lost impression share", baseSeverity: "medium", attention: true },
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
    case "lost_impression_share":
      return {
        status: absChangePct >= 30
          ? "needs_attention"
          : "watch",
        reason:
          "The campaign is missing eligible impressions to budget or Ad Rank, so it is not reaching all available demand — a visibility limit rather than a quality problem.",
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

function clampScore(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * DETERMINISTIC PERFORMANCE SCORE (0–100), code-only.
 *
 * Anchored per signal (each signal carries an intrinsic, spend-independent base
 * severity) and then moved by the MAGNITUDE of the performance change — a worse
 * deterioration scores lower, a bigger genuine improvement scores higher. Design
 * constraints:
 *   - Spend NEVER moves the score (it only drives business priority/severity).
 *     For scaling_efficiency, whose primary metric IS spend, the score is fixed.
 *   - Confidence is deliberately excluded so it stays a separate signal.
 *   - tracking_issue / low_volume / insufficient_comparison get no score (null).
 *
 * Bands: strong improvement highest; stable ≈ Good; mild deterioration ≈ Fair;
 * severe deterioration / creative fatigue = Needs Attention.
 *
 * @param absChangePct absolute % change of the signal's PRIMARY metric (never spend).
 */
function performanceScore(signal: Signal, absChangePct: number): number | null {
  const m = Number.isFinite(absChangePct) ? absChangePct : 0;
  switch (signal) {
    // No performance verdict — the UI shows "Check Data".
    case "tracking_issue":
    case "low_volume":
    case "insufficient_comparison":
      return null;

    // Very Good — the strongest improvement ranks highest.
    case "strong_improvement":
      return Math.round(clampScore(88 + Math.min(m, 40) * 0.3, 85, 100));

    // Good — efficiency held while scaling; spend size must not move the score.
    case "scaling_efficiency":
      return 84;

    // Good — nothing crossed a threshold.
    case "stable":
      return 76;

    // Fair, sliding toward Needs Attention as the auction cost spike grows.
    case "cpm_spike":
      return Math.round(clampScore(64 - Math.max(0, m - 25) * 0.5, 30, 69));

    // Fair for a mild CTR decline; a severe drop crosses into Needs Attention.
    case "ctr_drop":
      return Math.round(clampScore(64 - Math.max(0, m - 15) * 0.64, 20, 69));

    // Fair for mild CPA deterioration; severe (≥ 35%) crosses into Needs Attention.
    case "cpa_deterioration":
      return Math.round(clampScore(66 - Math.max(0, m - 20) * 1.13, 10, 69));

    // Needs Attention — creative fatigue is always a corrective-action case.
    case "creative_fatigue":
      return Math.round(clampScore(44 - Math.max(0, m - 20) * 0.3, 5, 49));

    // Fair — lost visibility means missed demand, worse as the loss grows; a
    // large loss slides into Needs Attention. (m = magnitude of impression loss.)
    case "lost_impression_share":
      return Math.round(clampScore(62 - Math.max(0, m - 10) * 0.6, 30, 69));
  }
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
  const today = new Date().toISOString().slice(0, 10);
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

    // Low volume must not MASK a stronger, more urgent issue. A tracking problem
    // or SEVERE performance deterioration takes precedence over the low-volume
    // notice so it is never hidden. (Mild moves on thin data still read as low
    // volume — the point of the notice is that thin data is unreliable.)
    const trackingCondition = clicksHeld && conversionsCollapsed;
    const supportsCtr = (dCpa !== null && dCpa > 5) || (dCvr !== null && dCvr < -5);
    const severeCpa = dCpa !== null && dCpa >= (SEVERE_THRESHOLD.cpa_deterioration ?? 35);
    const severeCtr =
      dCtr !== null && dCtr <= -(SEVERE_THRESHOLD.ctr_drop ?? 40) && supportsCtr;
    const fatigueCondition =
      dCtr !== null && dCtr <= -20 && dFreq !== null && dFreq >= 15 && dCpa !== null && dCpa > 0;
    const strongerIssue = trackingCondition || severeCpa || severeCtr || fatigueCondition;

    if (lowVolume && !strongerIssue) {
      signal = "low_volume";
      primaryMetric = "Conversions";
      primaryChange = dConv ?? 0;
      consistencyValue = 0.5;
      headline = "Still gathering results — not enough for a reliable score";
      whatChanged = `Only ${cur.conversions} conversions on ${money(cur.spend)} of spend in the current window (prior window: ${prev.conversions} conversions, ${money(prev.spend)}). No major issue detected yet.`;
      whyItMatters =
        "AdMate has the campaign data, but there are not enough results yet for a reliable performance score.";
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
      headline = "Conversions dropped sharply while clicks stayed steady";
      whatChanged = `Clicks moved ${dClicks?.toFixed(1)}% (${num(prev.clicks)} → ${num(cur.clicks)}) but conversions fell ${dConv?.toFixed(1)}% (${prev.conversions} → ${cur.conversions}), taking CVR from ${pctStr(cvr(prev))} to ${pctStr(cvr(cur))}.`;
      whyItMatters =
        "The same number of people are clicking, but far fewer conversions are being recorded. That often means conversions are not being tracked correctly, rather than a real drop in demand — and spend keeps running either way. Check tracking before making campaign changes.";
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

    // Deterministic, spend-free performance score (null for Check-Data signals).
    const perfScore = performanceScore(signal, Math.abs(primaryChange));
    const perfRating = perfScore === null ? null : performanceRatingFor(perfScore);
    const perfLabel = performanceLabelFor(signal, perfRating);
    const guidance = dataConfidenceGuidanceFor(signal);

    // Informational timing only — derived from the campaign's start/end dates,
    // never used in any classification, scoring or ranking above.
    const firstRow = campaign.rows[0];
    const timing = computeTiming(
      firstRow?.campaignStartDate ?? null,
      firstRow?.campaignEndDate ?? null,
      today,
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
      performanceScore: perfScore,
      performanceRating: perfRating,
      performanceLabel: perfLabel,
      guidance,
      timing,
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

/* ===========================================================================
 * MULTI-PLATFORM ANALYZERS
 *
 * runAnalysis above is the TikTok analyzer (unchanged). The generic runner
 * below shares the common AdMate OUTPUT structure — severity, confidence,
 * status, performance score/rating/label, timing, guidance, snapshot — while
 * each platform supplies its OWN detector: its own signal cascade, its own
 * thresholds, and its own platform-appropriate evidence rows. No platform
 * reuses another platform's rules.
 *   Code calculates → rules detect → AI explains (AI layer untouched).
 * ===========================================================================
 */

type Deltas = {
  dCpa: number | null;
  dCtr: number | null;
  dCvr: number | null;
  dCpm: number | null;
  dCpc: number | null;
  dSpend: number | null;
  dConv: number | null;
  dClicks: number | null;
  dImpr: number | null;
  dRoas: number | null;
  dFreq: number | null;
  freqCur: number;
  freqPrev: number;
};

type DetectorCtx = Deltas & {
  cur: Totals;
  prev: Totals;
  rows: NormalizedDailyRow[];
  current: string[];
  curSet: Set<string>;
  prevSet: Set<string>;
  /** Share of current-window days on the signal's side of the prior mean. */
  consistencyOf: (
    previousMean: number,
    metricOf: (t: Totals) => number,
    expect: "higher" | "lower",
  ) => number;
};

type DetectorResult = {
  signal: Signal;
  primaryMetric: string;
  /** Signed % change of the PRIMARY metric (magnitude drives score/severity). */
  primaryChange: number;
  consistencyValue: number;
  headline: string;
  whatChanged: string;
  whyItMatters: string;
  /** Platform-appropriate evidence rows. */
  metrics: MetricComparison[];
  /** Platform-specific description of the detection method/thresholds. */
  method: string;
  /** ctr_drop only: whether a severe CTR decline is corroborated downstream. */
  ctrSupported?: boolean;
};

type Detector = (ctx: DetectorCtx) => DetectorResult;

/** Impressions-weighted Search impression share (and share lost to budget / rank) for a window. */
function windowImpressionShare(
  rows: NormalizedDailyRow[],
  dateSet: Set<string>,
): { is: number; lostBudget: number; lostRank: number } {
  let imprSum = 0;
  let isW = 0;
  let lbW = 0;
  let lrW = 0;
  for (const r of rows) {
    if (!dateSet.has(r.date) || r.searchImpressionShare == null) continue;
    const w = r.impressions;
    imprSum += w;
    isW += r.searchImpressionShare * w;
    lbW += (r.searchLostIsBudget ?? 0) * w;
    lrW += (r.searchLostIsRank ?? 0) * w;
  }
  if (imprSum === 0) return { is: Number.NaN, lostBudget: Number.NaN, lostRank: Number.NaN };
  return { is: isW / imprSum, lostBudget: lbW / imprSum, lostRank: lrW / imprSum };
}

/**
 * Generic per-campaign runner. Owns the shared output structure; delegates the
 * signal cascade + evidence to the platform `detect` function.
 */
function analyzeCampaigns(
  rows: NormalizedDailyRow[],
  windowDays: number,
  detect: Detector,
  opts: { platformNoun: string },
): AnalysisResult {
  const today = new Date().toISOString().slice(0, 10);
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

    const freqCur = avgDailyFrequency(campaign.rows, curSet);
    const freqPrev = avgDailyFrequency(campaign.rows, prevSet);

    const ctx: DetectorCtx = {
      cur,
      prev,
      rows: campaign.rows,
      current,
      curSet,
      prevSet,
      dCpa: change(cpa(cur), cpa(prev)),
      dCtr: change(ctr(cur), ctr(prev)),
      dCvr: change(cvr(cur), cvr(prev)),
      dCpm: change(cpm(cur), cpm(prev)),
      dCpc: change(cpc(cur), cpc(prev)),
      dSpend: change(cur.spend, prev.spend),
      dConv: change(cur.conversions, prev.conversions),
      dClicks: change(cur.clicks, prev.clicks),
      dImpr: change(cur.impressions, prev.impressions),
      dRoas: change(roas(cur), roas(prev)),
      dFreq: change(freqCur, freqPrev),
      freqCur,
      freqPrev,
      consistencyOf: (mean, metricOf, expect) =>
        consistency(campaign.rows, current, mean, metricOf, expect),
    };

    const d = detect(ctx);
    const absChange = Math.abs(d.primaryChange);

    const { severity, score } = classifySeverity(d.signal, absChange, cur.spend);
    const { confidence, score: confidenceScore, basis } = classifyConfidence({
      cur,
      prev,
      windowDays,
      absChangePct: absChange,
      dayLevelConsistency: d.consistencyValue,
      signal: d.signal,
    });
    const { status, reason: statusReason } = classifyStatus(
      d.signal,
      absChange,
      d.ctrSupported ?? false,
    );

    const perfScore = performanceScore(d.signal, absChange);
    const perfRating = perfScore === null ? null : performanceRatingFor(perfScore);
    const perfLabel = performanceLabelFor(d.signal, perfRating);
    const guidance = dataConfidenceGuidanceFor(d.signal, opts.platformNoun);

    const firstRow = campaign.rows[0];
    const timing = computeTiming(
      firstRow?.campaignStartDate ?? null,
      firstRow?.campaignEndDate ?? null,
      today,
    );

    findings.push({
      campaignId,
      campaignName: campaign.name,
      signal: d.signal,
      signalLabel: SIGNAL_META[d.signal].label,
      status,
      statusLabel: STATUS_LABEL[status],
      statusReason,
      severity,
      severityScore: score,
      needsAttention: status === "needs_attention",
      headline: d.headline,
      whatChanged: d.whatChanged,
      whyItMatters: d.whyItMatters,
      confidence,
      confidenceScore,
      confidenceBasis: basis,
      performanceScore: perfScore,
      performanceRating: perfRating,
      performanceLabel: perfLabel,
      guidance,
      timing,
      evidence: {
        currentWindow: windowLabel,
        previousWindow: prevLabel,
        method: d.method,
        metrics: d.metrics,
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

/* ------------------------------- META ------------------------------------ */

/** Meta-appropriate evidence rows (results, cost per result, reach/frequency). */
function metaMetrics(ctx: DetectorCtx, primary: string): MetricComparison[] {
  const { cur, prev, dSpend, dCpa, dCpm, dCtr, dConv, dClicks, dRoas, dFreq, freqCur, freqPrev } = ctx;
  return [
    { label: "Spend", current: money(cur.spend), previous: money(prev.spend), changePct: dSpend, direction: dir(dSpend), primary: primary === "Spend" },
    { label: "Results", current: num(cur.conversions), previous: num(prev.conversions), changePct: dConv, direction: dir(dConv), primary: primary === "Results" },
    { label: "Cost per result", current: money(cpa(cur)), previous: money(cpa(prev)), changePct: dCpa, direction: dir(dCpa), primary: primary === "Cost per result" },
    { label: "CPM", current: money(cpm(cur)), previous: money(cpm(prev)), changePct: dCpm, direction: dir(dCpm), primary: primary === "CPM" },
    { label: "CTR", current: pctStr(ctr(cur)), previous: pctStr(ctr(prev)), changePct: dCtr, direction: dir(dCtr), primary: primary === "CTR" },
    { label: "Link clicks", current: num(cur.clicks), previous: num(prev.clicks), changePct: dClicks, direction: dir(dClicks) },
    { label: "Impressions", current: num(cur.impressions), previous: num(prev.impressions), changePct: change(cur.impressions, prev.impressions), direction: dir(change(cur.impressions, prev.impressions)) },
    { label: "Reach", current: num(cur.reach), previous: num(prev.reach), changePct: change(cur.reach, prev.reach), direction: dir(change(cur.reach, prev.reach)) },
    { label: "Frequency (avg daily)", current: num(freqCur), previous: num(freqPrev), changePct: dFreq, direction: dir(dFreq), primary: primary === "Frequency" },
    { label: "ROAS", current: ratio(roas(cur)), previous: ratio(roas(prev)), changePct: dRoas, direction: dir(dRoas), primary: primary === "ROAS" },
  ];
}

const META_METHOD =
  "Meta analyzer: latest 7 complete days vs the prior 7. Meta-specific thresholds — creative fatigue when avg daily frequency >= +12% AND CTR <= -12% AND cost per result rising (Meta saturation is frequency-led); delivery-cost pressure when CPM >= +20% with conversion rate roughly stable; cost-per-result deterioration when cost per result >= +18% (severe >= +40%); possible tracking issue when link clicks held (> -25%) while results fell >= 55%; strong improvement when cost per result <= -15% or ROAS >= +20% (never when cost per result worsened > +5%); early data below 10 results. Multiple supporting metrics required before a strong conclusion; spend never moves the score.";

const detectMeta: Detector = (ctx) => {
  const { cur, prev, dCpa, dCtr, dCvr, dCpm, dSpend, dConv, dClicks, dRoas, dFreq, freqCur, freqPrev } = ctx;

  const lowVolume = cur.conversions < 10;
  const noComparison = prev.days === 0 || prev.spend === 0 || prev.conversions === 0;
  const clicksHeld = dClicks !== null && dClicks > -25;
  const conversionsCollapsed = dConv !== null && dConv <= -55;
  const trackingCondition = clicksHeld && conversionsCollapsed;
  const fatigueCondition =
    dFreq !== null && dFreq >= 12 && dCtr !== null && dCtr <= -12 && dCpa !== null && dCpa > 0;
  const severeCpr = dCpa !== null && dCpa >= 40;
  const strongerIssue = trackingCondition || fatigueCondition || severeCpr;

  const base = (signal: Signal, primaryMetric: string, primaryChange: number, extra: {
    consistencyValue: number;
    headline: string;
    whatChanged: string;
    whyItMatters: string;
    ctrSupported?: boolean;
  }): DetectorResult => ({
    signal,
    primaryMetric,
    primaryChange,
    metrics: metaMetrics(ctx, primaryMetric),
    method: META_METHOD,
    ...extra,
  });

  if (lowVolume && !strongerIssue) {
    return base("low_volume", "Results", dConv ?? 0, {
      consistencyValue: 0.5,
      headline: "Still gathering results — not enough for a reliable score",
      whatChanged: `Only ${cur.conversions} results on ${money(cur.spend)} of spend this week (prior week: ${prev.conversions} results, ${money(prev.spend)}). No major issue detected yet.`,
      whyItMatters: "AdMate has the Meta data, but there are not enough results yet for a reliable performance score.",
    });
  }
  if (noComparison) {
    return base("insufficient_comparison", "Spend", 0, {
      consistencyValue: 0.5,
      headline: "No comparable prior period",
      whatChanged: `Current week: ${money(cur.spend)} of spend, ${cur.conversions} results. The prior week had no comparable activity, so period-over-period change cannot be computed.`,
      whyItMatters: "This looks like a new or recently reactivated Meta campaign. Without a comparable prior week, any change figure would be misleading.",
    });
  }
  if (trackingCondition) {
    return base("tracking_issue", "CVR", dCvr ?? 0, {
      consistencyValue: ctx.consistencyOf(cvr(prev), cvr, "lower"),
      headline: "Results dropped sharply while link clicks held steady",
      whatChanged: `Link clicks moved ${dClicks?.toFixed(1)}% but results fell ${dConv?.toFixed(1)}% (${prev.conversions} → ${cur.conversions}), taking CVR from ${pctStr(cvr(prev))} to ${pctStr(cvr(cur))}.`,
      whyItMatters: "The same number of people are clicking, but far fewer results are being recorded. On Meta this often points to Pixel / Conversions API tracking rather than a real demand drop — and spend keeps running either way.",
    });
  }
  if (fatigueCondition) {
    return base("creative_fatigue", "Frequency", dFreq ?? 0, {
      consistencyValue: ctx.consistencyOf(ctr(prev), ctr, "lower"),
      headline: "Frequency climbing while CTR falls and cost per result rises",
      whatChanged: `Avg daily frequency rose from ${num(freqPrev)} to ${num(freqCur)} (+${(dFreq ?? 0).toFixed(1)}%), CTR fell ${(dCtr ?? 0).toFixed(1)}%, and cost per result rose ${(dCpa ?? 0).toFixed(1)}%.`,
      whyItMatters: "On Meta, rising frequency with falling CTR and a higher cost per result is the classic creative-saturation pattern — the same people are seeing the ad more often and responding less.",
    });
  }
  if (dCpm !== null && dCpm >= 20 && (dCvr === null || dCvr > -10)) {
    return base("cpm_spike", "CPM", dCpm, {
      consistencyValue: ctx.consistencyOf(cpm(prev), cpm, "higher"),
      headline: `Delivery cost pressure — CPM up ${dCpm.toFixed(1)}%`,
      whatChanged: `CPM rose from ${money(cpm(prev))} to ${money(cpm(cur))} (+${dCpm.toFixed(1)}%) while conversion rate held (${pctStr(cvr(prev))} → ${pctStr(cvr(cur))}).`,
      whyItMatters: "Meta auction/delivery cost is higher, so the same budget buys fewer impressions and results. Conversion quality looks intact, so this reads as delivery-cost pressure rather than a funnel problem.",
    });
  }
  if (dCpa !== null && dCpa >= 18) {
    return base("cpa_deterioration", "Cost per result", dCpa, {
      consistencyValue: ctx.consistencyOf(cpa(prev), cpa, "higher"),
      headline: `Cost per result rose ${dCpa.toFixed(1)}%`,
      whatChanged: `Cost per result moved from ${money(cpa(prev))} to ${money(cpa(cur))} (+${dCpa.toFixed(1)}%), with conversion rate ${pctStr(cvr(prev))} → ${pctStr(cvr(cur))} and CPM ${money(cpm(prev))} → ${money(cpm(cur))}.`,
      whyItMatters: `${money(cur.spend)} of Meta spend this week is buying results at a materially higher cost, driven by weaker conversion rate rather than delivery cost.`,
    });
  }
  if (!(dCpa !== null && dCpa > 5) && ((dCpa !== null && dCpa <= -15) || (dRoas !== null && dRoas >= 20))) {
    const byCpa = dCpa !== null && dCpa <= -15;
    return base("strong_improvement", byCpa ? "Cost per result" : "ROAS", byCpa ? dCpa : (dRoas ?? 0), {
      consistencyValue: ctx.consistencyOf(cpa(prev), cpa, "lower"),
      headline: "Efficiency improved materially",
      whatChanged: `Cost per result ${money(cpa(prev))} → ${money(cpa(cur))} (${dCpa === null ? "n/a" : `${dCpa.toFixed(1)}%`}) and ROAS ${ratio(roas(prev))} → ${ratio(roas(cur))} (${dRoas === null ? "n/a" : `${dRoas.toFixed(1)}%`}).`,
      whyItMatters: "Results are getting cheaper (or more valuable) at current budget, so this is the strongest Meta candidate for additional spend.",
    });
  }
  return base("stable", "Cost per result", dCpa ?? 0, {
    consistencyValue: 0.5,
    headline: "No material change detected",
    whatChanged: `Cost per result ${dCpa === null ? "n/a" : `${dCpa.toFixed(1)}%`}, CTR ${dCtr === null ? "n/a" : `${dCtr.toFixed(1)}%`}, CPM ${dCpm === null ? "n/a" : `${dCpm.toFixed(1)}%`}, frequency ${dFreq === null ? "n/a" : `${dFreq.toFixed(1)}%`}, spend ${dSpend === null ? "n/a" : `${dSpend.toFixed(1)}%`} — all inside Meta thresholds.`,
    whyItMatters: "Nothing crossed a Meta detection threshold, so no action is required for this campaign.",
  });
};

export function runMetaAnalysis(rows: NormalizedDailyRow[], windowDays = 7): AnalysisResult {
  return analyzeCampaigns(rows, windowDays, detectMeta, { platformNoun: "Meta" });
}

/* -------------------------- GOOGLE SEARCH -------------------------------- */

function googleMetrics(ctx: DetectorCtx, primary: string): MetricComparison[] {
  const { cur, prev, dSpend, dCpa, dCpc, dCtr, dConv, dClicks, dRoas } = ctx;
  const curIS = windowImpressionShare(ctx.rows, ctx.curSet);
  const prevIS = windowImpressionShare(ctx.rows, ctx.prevSet);
  return [
    { label: "Spend", current: money(cur.spend), previous: money(prev.spend), changePct: dSpend, direction: dir(dSpend), primary: primary === "Spend" },
    { label: "Conversions", current: num(cur.conversions), previous: num(prev.conversions), changePct: dConv, direction: dir(dConv), primary: primary === "Conversions" },
    { label: "Cost per conversion", current: money(cpa(cur)), previous: money(cpa(prev)), changePct: dCpa, direction: dir(dCpa), primary: primary === "CPA" },
    { label: "CPC (avg)", current: money(cpc(cur)), previous: money(cpc(prev)), changePct: dCpc, direction: dir(dCpc), primary: primary === "CPC" },
    { label: "CTR", current: pctStr(ctr(cur)), previous: pctStr(ctr(prev)), changePct: dCtr, direction: dir(dCtr), primary: primary === "CTR" },
    { label: "Clicks", current: num(cur.clicks), previous: num(prev.clicks), changePct: dClicks, direction: dir(dClicks) },
    { label: "Impressions", current: num(cur.impressions), previous: num(prev.impressions), changePct: change(cur.impressions, prev.impressions), direction: dir(change(cur.impressions, prev.impressions)), primary: primary === "Impressions" },
    { label: "Conversion value", current: money(cur.revenue), previous: money(prev.revenue), changePct: change(cur.revenue, prev.revenue), direction: dir(change(cur.revenue, prev.revenue)) },
    { label: "ROAS", current: ratio(roas(cur)), previous: ratio(roas(prev)), changePct: dRoas, direction: dir(dRoas), primary: primary === "ROAS" },
    { label: "Search impression share", current: pctStr(curIS.is), previous: pctStr(prevIS.is), changePct: change(curIS.is, prevIS.is), direction: dir(change(curIS.is, prevIS.is)), primary: primary === "Impression share" },
    { label: "Lost IS (budget)", current: pctStr(curIS.lostBudget), previous: pctStr(prevIS.lostBudget), changePct: change(curIS.lostBudget, prevIS.lostBudget), direction: dir(change(curIS.lostBudget, prevIS.lostBudget)) },
    { label: "Lost IS (rank)", current: pctStr(curIS.lostRank), previous: pctStr(prevIS.lostRank), changePct: change(curIS.lostRank, prevIS.lostRank), direction: dir(change(curIS.lostRank, prevIS.lostRank)) },
  ];
}

const GOOGLE_METHOD =
  "Google Search analyzer: latest 7 complete days vs the prior 7. Search-specific thresholds — lost visibility when Search impression share fell >= 8 points AND impressions are constrained by budget (>= 15% lost) or Ad Rank (>= 20% lost); CPA deterioration / rising CPC when cost per conversion >= +18% (severe >= +40%), typically alongside higher CPC; search-relevance weakness when CTR <= -12%; strong improvement when conversion value / ROAS >= +20% or cost per conversion <= -15% (never when CPA worsened > +5%); early data below 10 conversions. Quality Score is NOT used as the performance score. Cautious wording; multiple supporting metrics required.";

const detectGoogleSearch: Detector = (ctx) => {
  const { cur, prev, dCpa, dCpc, dCtr, dConv, dClicks, dImpr, dRoas } = ctx;

  const lowVolume = cur.conversions < 10;
  const noComparison = prev.days === 0 || prev.spend === 0 || prev.conversions === 0;
  const curIS = windowImpressionShare(ctx.rows, ctx.curSet);
  const prevIS = windowImpressionShare(ctx.rows, ctx.prevSet);
  const isDropPts = Number.isFinite(curIS.is) && Number.isFinite(prevIS.is) ? prevIS.is - curIS.is : 0;
  const budgetOrRankLimited =
    (Number.isFinite(curIS.lostBudget) && curIS.lostBudget >= 0.15) ||
    (Number.isFinite(curIS.lostRank) && curIS.lostRank >= 0.2);
  const visibilityLimited = isDropPts >= 0.08 && budgetOrRankLimited;
  const severeCpa = dCpa !== null && dCpa >= 40;

  const base = (signal: Signal, primaryMetric: string, primaryChange: number, extra: {
    consistencyValue: number;
    headline: string;
    whatChanged: string;
    whyItMatters: string;
    ctrSupported?: boolean;
  }): DetectorResult => ({
    signal,
    primaryMetric,
    primaryChange,
    metrics: googleMetrics(ctx, primaryMetric),
    method: GOOGLE_METHOD,
    ...extra,
  });

  if (lowVolume && !severeCpa && !visibilityLimited) {
    return base("low_volume", "Conversions", dConv ?? 0, {
      consistencyValue: 0.5,
      headline: "Still gathering conversions — not enough for a reliable score",
      whatChanged: `Only ${cur.conversions} conversions on ${money(cur.spend)} of spend this week (prior week: ${prev.conversions}). No major issue detected yet.`,
      whyItMatters: "AdMate has the Google Search data, but there are not enough conversions yet for a reliable performance score.",
    });
  }
  if (noComparison) {
    return base("insufficient_comparison", "Spend", 0, {
      consistencyValue: 0.5,
      headline: "No comparable prior period",
      whatChanged: `Current week: ${money(cur.spend)} of spend, ${cur.conversions} conversions. The prior week had no comparable activity, so period-over-period change cannot be computed.`,
      whyItMatters: "This looks like a new or recently reactivated Search campaign. Without a comparable prior week, any change figure would be misleading.",
    });
  }
  if (visibilityLimited) {
    return base("lost_impression_share", "Impression share", -(isDropPts * 100), {
      consistencyValue: ctx.consistencyOf(prev.impressions / Math.max(1, prev.days), (t) => t.impressions, "lower"),
      headline: `Losing visibility — impression share down ${(isDropPts * 100).toFixed(1)} points`,
      whatChanged: `Search impression share fell from ${pctStr(prevIS.is)} to ${pctStr(curIS.is)}; impressions moved ${dImpr === null ? "n/a" : `${dImpr.toFixed(1)}%`}. Share lost to budget is ${pctStr(curIS.lostBudget)} and to rank ${pctStr(curIS.lostRank)}.`,
      whyItMatters: "The ads are eligible for more searches than they are showing on, so demand is being missed — a budget or Ad Rank limit, not a conversion-quality problem.",
    });
  }
  if (dCpa !== null && dCpa >= 18) {
    return base("cpa_deterioration", "CPA", dCpa, {
      consistencyValue: ctx.consistencyOf(cpa(prev), cpa, "higher"),
      headline: `Cost per conversion rose ${dCpa.toFixed(1)}%`,
      whatChanged: `Cost per conversion moved ${money(cpa(prev))} → ${money(cpa(cur))} (+${dCpa.toFixed(1)}%), with average CPC ${money(cpc(prev))} → ${money(cpc(cur))} (${dCpc === null ? "n/a" : `${dCpc.toFixed(1)}%`}).`,
      whyItMatters: "Rising auction prices (CPC) are lifting cost per conversion, so each result costs more at the same budget.",
    });
  }
  if (dCtr !== null && dCtr <= -12) {
    return base("ctr_drop", "CTR", dCtr, {
      consistencyValue: ctx.consistencyOf(ctr(prev), ctr, "lower"),
      headline: `CTR dropped ${Math.abs(dCtr).toFixed(1)}%`,
      whatChanged: `CTR fell from ${pctStr(ctr(prev))} to ${pctStr(ctr(cur))} (${dCtr.toFixed(1)}%) while impression share held, pointing to ad relevance rather than a visibility limit.`,
      whyItMatters: "Fewer searchers are clicking the ad. On Search this usually signals weaker query/ad relevance, which raises effective CPC and can pressure Ad Rank over time.",
      ctrSupported: (dCpa !== null && dCpa > 5),
    });
  }
  if (!(dCpa !== null && dCpa > 5) && ((dRoas !== null && dRoas >= 20) || (dCpa !== null && dCpa <= -15))) {
    const byRoas = !(dCpa !== null && dCpa <= -15);
    return base("strong_improvement", byRoas ? "ROAS" : "CPA", byRoas ? (dRoas ?? 0) : (dCpa ?? 0), {
      consistencyValue: ctx.consistencyOf(cpa(prev), cpa, "lower"),
      headline: "Conversion value improved materially",
      whatChanged: `ROAS ${ratio(roas(prev))} → ${ratio(roas(cur))} (${dRoas === null ? "n/a" : `${dRoas.toFixed(1)}%`}) and cost per conversion ${money(cpa(prev))} → ${money(cpa(cur))} (${dCpa === null ? "n/a" : `${dCpa.toFixed(1)}%`}).`,
      whyItMatters: "Conversion value is rising faster than cost, so this Search campaign is the strongest candidate for additional budget.",
    });
  }
  return base("stable", "CPA", dCpa ?? 0, {
    consistencyValue: 0.5,
    headline: "No material change detected",
    whatChanged: `Cost per conversion ${dCpa === null ? "n/a" : `${dCpa.toFixed(1)}%`}, CPC ${dCpc === null ? "n/a" : `${dCpc.toFixed(1)}%`}, CTR ${dCtr === null ? "n/a" : `${dCtr.toFixed(1)}%`}, impressions ${dImpr === null ? "n/a" : `${dImpr.toFixed(1)}%`} — all inside Search thresholds.`,
    whyItMatters: "Nothing crossed a Google Search detection threshold, so no action is required for this campaign.",
  });
};

export function runGoogleSearchAnalysis(rows: NormalizedDailyRow[], windowDays = 7): AnalysisResult {
  return analyzeCampaigns(rows, windowDays, detectGoogleSearch, { platformNoun: "Google" });
}
