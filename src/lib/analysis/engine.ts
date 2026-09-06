/**
 * AdMate objective-aware analysis engine — the single source of truth.
 *
 * Code (never AI) owns: normalization, objective→KPI selection, comparison
 * source (target → own baseline → comparable peers), maturity/In-Review gates,
 * error/tracking detection, multi-signal diagnosis (signal / why / action),
 * the Performance verdict (High / Moderate / Low / In Review / Error) and
 * priority / exposure. The AI layer may only rephrase this structured output.
 *
 * A campaign is judged on the metric its OBJECTIVE was actually bought against —
 * a video-views campaign has no meaningful ROAS, a lead campaign banks revenue
 * weeks later — so upper-funnel work is never cut for missing a sales target.
 */

import type { Platform } from "../platforms";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export type Performance = "High" | "Moderate" | "Low" | "In Review" | "Error";
export type Confidence = "High" | "Medium" | "Low";
export type PriorityTier = "Critical" | "High" | "Medium" | "Low";

/** Normalized objective family — the analytical bucket, not the raw platform name. */
export type ObjectiveFamily =
  | "sales"
  | "leads"
  | "traffic_lpv"
  | "traffic_clicks"
  | "engagement"
  | "video"
  | "awareness"
  | "app";

export type ComparisonKind = "target" | "baseline" | "peers" | "none";

export type CampaignState =
  | "active"
  | "learning"
  | "learning_limited"
  | "new"
  | "recently_edited"
  | "limited_by_budget"
  | "insufficient_volume"
  | "insufficient_history";

export type TargetType =
  | "tROAS"
  | "tCPA"
  | "costCap"
  | "cpl"
  | "cpc"
  | "cpm"
  | "cpv"
  | "cpi"
  | "cost_per_lpv";

export type CampaignTarget = { type: TargetType; value: number };

export type DailyMetric = {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  reach?: number;
  landingPageViews?: number;
  videoViews?: number; // platform "views" (Meta ThruPlay / TikTok video views)
  focusedViews?: number; // TikTok focused view (6s or full if <6s)
  videoWatched2s?: number;
  videoP100?: number; // 100% completions
  leads?: number;
  installs?: number;
  searchImpressionShare?: number; // 0..1
  searchLostIsRank?: number; // 0..1
  searchLostIsBudget?: number; // 0..1
};

/** What a provider (or a future live connector) hands the engine per campaign. */
export type CampaignInput = {
  campaignId: string;
  campaignName: string;
  platform: Platform;
  objective: string; // raw platform objective, e.g. "Sales", "Video views"
  optimizationGoal?: string; // raw, e.g. "Landing page views", "Focused view"
  campaignType?: string; // Google, e.g. "Performance Max", "Search", "Shopping"
  bidStrategy?: string; // e.g. "Target ROAS", "Maximize conversions", "tCPA"
  conversionGoal?: string; // e.g. "Purchase", "Lead", "Install"
  status?: string; // raw platform status
  learningStatus?: "learning" | "learning_limited" | "active" | null;
  startDate?: string | null;
  endDate?: string | null;
  lastMajorEditDate?: string | null;
  target?: CampaignTarget | null;
  /** Explicit measurement signals. Absence never implies failure. */
  tracking?: { conversionTrackingActive?: boolean; measurementError?: boolean };
  days: DailyMetric[];
};

export type EvidenceRow = {
  label: string;
  current: string;
  previous: string;
  changePct: number | null;
  direction: "up" | "down" | "flat";
  /** Plain-English meaning of the movement (marketer-facing). */
  meaning?: string;
  primary?: boolean;
};

export type CampaignTiming = {
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  label: string;
};

export type Exposure = {
  /** budget_at_risk = defensible $ overspend vs target; spend_exposure = $ at stake (upper funnel). */
  kind: "budget_at_risk" | "spend_exposure";
  amount: number;
  label: string;
};

export type CampaignFinding = {
  campaignId: string;
  campaignName: string;
  platform: Platform;

  objective: string;
  objectiveFamily: ObjectiveFamily;
  objectiveLabel: string; // human family label, e.g. "Sales", "Video views"
  optimizationGoal: string | null;
  campaignType: string | null;
  bidStrategy: string | null;
  conversionGoal: string | null;
  campaignState: CampaignState;
  campaignStateLabel: string;

  performance: Performance;

  /** Primary KPI the objective is graded on. */
  primaryMetric: string;
  primaryMetricValue: string;
  comparisonSource: ComparisonKind;
  comparisonLabel: string; // e.g. "Target ROAS 3.00x", "Own 4-week baseline", "Similar campaigns"
  targetOrBaseline: string | null;

  /** Analytical condition (a diagnosis, never a bare metric restatement). */
  signal: string;
  why: string;
  action: string;

  evidence: EvidenceRow[];
  /** Objective-aware KPI cells for the campaign table. */
  supportingColumns: { label: string; value: string }[];

  diagnosticConfidence: Confidence;
  priority: number; // internal weighting, never shown as a user score
  priorityTier: PriorityTier;
  exposure: Exposure;

  spend: number;
  timing: CampaignTiming;

  /** AI narrative (optional, rephrasing only). */
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

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

const money = (n: number) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
const money0 = (n: number) =>
  Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
const money3 = (n: number) => (Number.isFinite(n) ? `$${n.toFixed(3)}` : "—");
const ratioX = (n: number) => (Number.isFinite(n) ? `${n.toFixed(2)}x` : "—");
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
const int = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
const freqFmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

function changePct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}
function dir(change: number | null): "up" | "down" | "flat" {
  if (change === null) return "flat";
  if (change > 1) return "up";
  if (change < -1) return "down";
  return "flat";
}

/* ========================================================================== */
/* Window metrics                                                              */
/* ========================================================================== */

export type WindowMetrics = {
  days: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  reachAvgDaily: number;
  landingPageViews: number;
  videoViews: number;
  focusedViews: number;
  videoWatched2s: number;
  videoP100: number;
  leads: number;
  installs: number;
  // derived
  ctr: number;
  cpc: number;
  cpm: number;
  cvr: number;
  cpa: number;
  roas: number;
  frequency: number;
  cpl: number;
  leadRate: number;
  cpLpv: number;
  lpvRate: number;
  cpv: number;
  viewRate: number;
  completionRate: number;
  hookRate: number; // 2s views / impressions
  cpi: number;
  searchImpressionShare: number;
  searchLostIsRank: number;
  searchLostIsBudget: number;
};

const NaNn = Number.NaN;
function safe(n: number, d: number): number {
  return d > 0 && Number.isFinite(n) ? n / d : NaNn;
}

function aggregate(days: DailyMetric[]): WindowMetrics {
  const sum = (k: (d: DailyMetric) => number) => days.reduce((a, d) => a + (k(d) || 0), 0);
  const spend = sum((d) => d.spend);
  const impressions = sum((d) => d.impressions);
  const clicks = sum((d) => d.clicks);
  const conversions = sum((d) => d.conversions);
  const revenue = sum((d) => d.revenue);
  const landingPageViews = sum((d) => d.landingPageViews ?? 0);
  const videoViews = sum((d) => d.videoViews ?? 0);
  const focusedViews = sum((d) => d.focusedViews ?? 0);
  const videoWatched2s = sum((d) => d.videoWatched2s ?? 0);
  const videoP100 = sum((d) => d.videoP100 ?? 0);
  const leads = sum((d) => d.leads ?? 0);
  const installs = sum((d) => d.installs ?? 0);
  // reach: average of daily reach (windows aren't deduplicated across days).
  const reachDays = days.filter((d) => Number.isFinite(d.reach ?? NaNn));
  const reachAvgDaily = reachDays.length
    ? reachDays.reduce((a, d) => a + (d.reach as number), 0) / reachDays.length
    : NaNn;
  const frequency = (() => {
    const vals = days
      .filter((d) => (d.reach ?? 0) > 0)
      .map((d) => d.impressions / (d.reach as number));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaNn;
  })();
  // impression-share weighted by impressions
  const isRows = days.filter((d) => Number.isFinite(d.searchImpressionShare ?? NaNn));
  const isImpr = isRows.reduce((a, d) => a + d.impressions, 0);
  const wAvg = (k: (d: DailyMetric) => number | undefined) =>
    isImpr > 0 ? isRows.reduce((a, d) => a + (k(d) ?? 0) * d.impressions, 0) / isImpr : NaNn;

  return {
    days: days.length,
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
    reachAvgDaily,
    landingPageViews,
    videoViews,
    focusedViews,
    videoWatched2s,
    videoP100,
    leads,
    installs,
    ctr: safe(clicks, impressions),
    cpc: safe(spend, clicks),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : NaNn,
    cvr: safe(conversions, clicks),
    cpa: safe(spend, conversions),
    roas: safe(revenue, spend),
    frequency,
    cpl: safe(spend, leads),
    leadRate: safe(leads, clicks),
    cpLpv: safe(spend, landingPageViews),
    lpvRate: safe(landingPageViews, clicks),
    cpv: focusedViews > 0 ? safe(spend, focusedViews) : safe(spend, videoViews),
    viewRate: safe(focusedViews > 0 ? focusedViews : videoViews, impressions),
    completionRate: safe(videoP100, videoViews > 0 ? videoViews : impressions),
    hookRate: safe(videoWatched2s, impressions),
    cpi: safe(spend, installs),
    searchImpressionShare: wAvg((d) => d.searchImpressionShare),
    searchLostIsRank: wAvg((d) => d.searchLostIsRank),
    searchLostIsBudget: wAvg((d) => d.searchLostIsBudget),
  };
}

/* ========================================================================== */
/* Objective normalization + KPI registry                                      */
/* ========================================================================== */

export const FAMILY_LABEL: Record<ObjectiveFamily, string> = {
  sales: "Sales",
  leads: "Lead generation",
  traffic_lpv: "Traffic — landing-page views",
  traffic_clicks: "Traffic — clicks",
  engagement: "Engagement",
  video: "Video views",
  awareness: "Awareness",
  app: "App promotion",
};

function lc(s?: string | null): string {
  return (s ?? "").toLowerCase();
}

/** Map raw platform objective/goal/type into a normalized analytical family. */
export function normalizeFamily(c: {
  platform: Platform;
  objective: string;
  optimizationGoal?: string;
  campaignType?: string;
  conversionGoal?: string;
}): ObjectiveFamily {
  const o = lc(c.objective);
  const g = lc(c.optimizationGoal);
  const t = lc(c.campaignType);
  const cg = lc(c.conversionGoal);

  if (/(reach|awareness|impression|brand)/.test(o) && !/video/.test(o)) return "awareness";
  if (/video/.test(o) || /video/.test(g) || t === "video") return "video";
  if (/(lead)/.test(o) || /lead/.test(cg)) return "leads";
  if (/(app|install)/.test(o) || /install/.test(cg)) return "app";
  if (/(engagement|community|interaction)/.test(o)) return "engagement";
  if (/traffic/.test(o)) {
    if (/(landing|lpv|profile|view content)/.test(g)) return "traffic_lpv";
    return "traffic_clicks";
  }
  // Sales-like: sales, conversions, product sales, catalogue, shopping, pmax, web conversions
  if (
    /(sale|conversion|purchase|shopping|commerce|catalog|performance max|pmax)/.test(
      `${o} ${t} ${cg}`,
    )
  ) {
    return "sales";
  }
  // Fallback: if the goal is clicks/traffic-ish
  if (/(click|traffic)/.test(g)) return "traffic_clicks";
  return "sales";
}

type PrimaryKpi = {
  key: string;
  label: string;
  better: "high" | "low";
  value: number;
  fmt: (n: number) => string;
  /** Which TargetType matches this KPI. */
  targetType: TargetType | null;
};

/** Resolve the primary KPI for a campaign, given its family + metrics. */
function resolvePrimary(family: ObjectiveFamily, m: WindowMetrics): PrimaryKpi {
  switch (family) {
    case "sales":
      // Value-optimized (revenue present) → ROAS; otherwise cost per acquisition.
      if (m.revenue > 0 && Number.isFinite(m.roas)) {
        return { key: "roas", label: "ROAS", better: "high", value: m.roas, fmt: ratioX, targetType: "tROAS" };
      }
      return { key: "cpa", label: "CPA", better: "low", value: m.cpa, fmt: money, targetType: "tCPA" };
    case "leads":
      return { key: "cpl", label: "Cost per lead", better: "low", value: m.cpl, fmt: money, targetType: "cpl" };
    case "traffic_lpv":
      return {
        key: "cpLpv",
        label: "Cost / landing-page view",
        better: "low",
        value: m.cpLpv,
        fmt: money,
        targetType: "cost_per_lpv",
      };
    case "traffic_clicks":
      return { key: "cpc", label: "CPC", better: "low", value: m.cpc, fmt: money, targetType: "cpc" };
    case "engagement":
      return { key: "cpc", label: "Cost / engagement", better: "low", value: m.cpc, fmt: money, targetType: "cpc" };
    case "video":
      return {
        key: "cpv",
        label: "Cost / view",
        better: "low",
        value: m.cpv,
        fmt: money3,
        targetType: "cpv",
      };
    case "awareness":
      return { key: "cpm", label: "CPM", better: "low", value: m.cpm, fmt: money, targetType: "cpm" };
    case "app":
      return { key: "cpi", label: "Cost / install", better: "low", value: m.cpi, fmt: money, targetType: "cpi" };
  }
}

/** Objective-aware supporting KPI cells (for the table) + evidence ordering. */
function supportingColumns(
  family: ObjectiveFamily,
  m: WindowMetrics,
): { label: string; value: string }[] {
  switch (family) {
    case "sales":
      return [
        { label: "Purchases", value: int(m.conversions) },
        { label: "ROAS", value: ratioX(m.roas) },
        { label: "CPA", value: money(m.cpa) },
      ];
    case "leads":
      return [
        { label: "Leads", value: int(m.leads) },
        { label: "CPL", value: money(m.cpl) },
        { label: "Click→lead", value: pct(m.leadRate) },
      ];
    case "traffic_lpv":
      return [
        { label: "LPVs", value: int(m.landingPageViews) },
        { label: "Cost/LPV", value: money(m.cpLpv) },
        { label: "LPV rate", value: pct(m.lpvRate) },
      ];
    case "traffic_clicks":
    case "engagement":
      return [
        { label: "Clicks", value: int(m.clicks) },
        { label: "CPC", value: money(m.cpc) },
        { label: "CTR", value: pct(m.ctr) },
      ];
    case "video":
      return [
        { label: "Views", value: int(m.focusedViews > 0 ? m.focusedViews : m.videoViews) },
        { label: "Cost/view", value: money3(m.cpv) },
        { label: "View rate", value: pct(m.viewRate) },
      ];
    case "awareness":
      return [
        { label: "Reach", value: int(m.reachAvgDaily) },
        { label: "CPM", value: money(m.cpm) },
        { label: "Frequency", value: freqFmt(m.frequency) },
      ];
    case "app":
      return [
        { label: "Installs", value: int(m.installs) },
        { label: "Cost/install", value: money(m.cpi) },
        { label: "CVR", value: pct(m.cvr) },
      ];
  }
}

/* ========================================================================== */
/* Timing (informational only)                                                 */
/* ========================================================================== */

function fmtShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}
export function computeTiming(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  todayIso: string = new Date().toISOString().slice(0, 10),
): CampaignTiming {
  const start = startDate ?? null;
  const end = endDate ?? null;
  if (start && start > todayIso)
    return { startDate: start, endDate: end, daysRemaining: null, label: `Starts ${fmtShort(start)}` };
  if (end) {
    const remaining = daysBetween(todayIso, end);
    if (remaining < 0)
      return { startDate: start, endDate: end, daysRemaining: remaining, label: `Ended ${fmtShort(end)}` };
    if (remaining === 0) return { startDate: start, endDate: end, daysRemaining: 0, label: "Ends Today" };
    if (remaining === 1) return { startDate: start, endDate: end, daysRemaining: 1, label: "Ends Tomorrow" };
    return {
      startDate: start,
      endDate: end,
      daysRemaining: remaining,
      label: `Ends ${fmtShort(end)} · ${remaining} days left`,
    };
  }
  return { startDate: start, endDate: end, daysRemaining: null, label: "Ongoing · No end date" };
}

/* ========================================================================== */
/* Comparison source: target → own baseline → comparable peers → none          */
/* ========================================================================== */

const STATE_LABEL: Record<CampaignState, string> = {
  active: "Active",
  learning: "Learning",
  learning_limited: "Learning (limited)",
  new: "New campaign",
  recently_edited: "Recently edited",
  limited_by_budget: "Limited by budget",
  insufficient_volume: "Low volume",
  insufficient_history: "Insufficient history",
};

/** Minimum conversions/results in the current window before a KPI is judgeable. */
function resultVolume(family: ObjectiveFamily, m: WindowMetrics): number {
  switch (family) {
    case "sales":
      return m.conversions;
    case "leads":
      return m.leads;
    case "traffic_lpv":
      return m.landingPageViews;
    case "traffic_clicks":
    case "engagement":
      return m.clicks;
    case "video":
      return m.focusedViews > 0 ? m.focusedViews : m.videoViews;
    case "awareness":
      return m.impressions;
    case "app":
      return m.installs;
  }
}

const MIN_RESULTS: Record<ObjectiveFamily, number> = {
  sales: 15,
  leads: 15,
  traffic_lpv: 150,
  traffic_clicks: 200,
  engagement: 150,
  video: 500,
  awareness: 5000,
  app: 15,
};

/* ========================================================================== */
/* Multi-signal diagnosis                                                       */
/* ========================================================================== */

type Deltas = {
  dPrimary: number | null; // change of primary KPI, in "worse is positive%" terms handled by caller
  dCtr: number | null;
  dCvr: number | null;
  dCpm: number | null;
  dCpc: number | null;
  dFreq: number | null;
  dSpend: number | null;
  dReach: number | null;
  dConv: number | null;
  dClicks: number | null;
  dLeadRate: number | null;
  dLpvRate: number | null;
  dViewRate: number | null;
  dCompletion: number | null;
  dHook: number | null;
};

type Diagnosis = { signal: string; why: string; action: string };

/**
 * Relationship-based diagnosis. `worse` means the primary KPI moved in the
 * unwanted direction materially. Returns the most specific supported pattern.
 */
function diagnose(
  family: ObjectiveFamily,
  platform: Platform,
  campaignType: string | null,
  cur: WindowMetrics,
  prev: WindowMetrics,
  d: Deltas,
  worse: boolean,
  better: boolean,
): Diagnosis {
  // Downstream conversion rate depends on the objective: leads use click→lead,
  // LPV traffic uses LPV rate, everything else uses CVR.
  const downRate =
    family === "leads" ? d.dLeadRate : family === "traffic_lpv" ? d.dLpvRate : d.dCvr;
  const ctrFalling = (d.dCtr ?? 0) <= -8;
  const ctrStable = Math.abs(d.dCtr ?? 0) < 8;
  const ctrRising = (d.dCtr ?? 0) >= 8;
  const cvrFalling = (downRate ?? 0) <= -8;
  const freqRising = (d.dFreq ?? 0) >= 10 || cur.frequency >= 3.2;
  const cpmRising = (d.dCpm ?? 0) >= 18;
  const spendUp = (d.dSpend ?? 0) >= 20;

  // Google Search intent mismatch (query relevance): low/declining CTR + weak CVR,
  // and share lost to rank rather than budget.
  if (
    platform === "google_search" &&
    (campaignType ?? "").toLowerCase().includes("search") &&
    (ctrFalling || cur.ctr < 0.03) &&
    (cvrFalling || (family === "sales" && cur.cvr < 0.02)) &&
    (cur.searchLostIsRank ?? 0) >= 0.15
  ) {
    return {
      signal: "Search-intent mismatch",
      why: `Click-through is weak (CTR ${pct(cur.ctr)}) and conversion rate is soft (${pct(cur.cvr)}) while ${pct(cur.searchLostIsRank)} of impressions are lost to Ad Rank — the ads are matching queries that do not convert.`,
      action:
        "Tighten keywords and add negatives for low-intent queries, then align ad copy and landing page to the remaining terms before raising bids.",
    };
  }

  if (worse) {
    if (ctrFalling && freqRising) {
      return {
        signal: "Creative fatigue",
        why: `The audience is saturating — frequency ${freqRising ? "is rising" : "is high"} (${freqFmt(cur.frequency)}) while CTR fell ${fmtPctChange(d.dCtr)} and the result cost worsened. The same people are seeing the ad more and responding less.`,
        action:
          "Rotate in 3 fresh creative variants against the same offer before touching budget; hold spend flat until CTR recovers.",
      };
    }
    if (cpmRising && ctrStable && !cvrFalling) {
      return {
        signal: "Auction pressure",
        why: `Delivery cost rose (CPM ${fmtPctChange(d.dCpm)}) while CTR and conversion rate held — the cost increase is coming from the auction, not from weaker creative or a broken funnel.`,
        action:
          "This is market pricing, not a creative problem. Broaden the audience or shift budget to cheaper placements; only raise bids if the result still clears target.",
      };
    }
    if ((ctrStable || ctrRising) && cvrFalling) {
      const label =
        family === "leads"
          ? "Lead-form drop-off"
          : family === "traffic_lpv"
            ? "Landing-page drop-off"
            : "Post-click drop-off";
      return {
        signal: label,
        why: `People are still clicking (CTR ${d.dCtr === null ? "stable" : fmtPctChange(d.dCtr)}) but far fewer complete — conversion rate fell ${fmtPctChange(downRate)}. The weakness is after the click: landing page, offer or checkout.`,
        action:
          family === "leads"
            ? "Shorten the form and match the landing page to the ad promise before adding budget — more spend will not fix a weak form."
            : "Audit the landing page, offer and checkout for the clicked audience; fix the post-click experience before scaling.",
      };
    }
    if (family === "video" && (d.dHook ?? 0) <= -8) {
      return {
        signal: "Weak hook",
        why: `Fewer people get past the first seconds (2s view rate ${fmtPctChange(d.dHook)}) and cost per view rose — the opening is not holding attention.`,
        action: "Re-cut the first 3 seconds with a stronger hook; test 2–3 openings against the same body.",
      };
    }
    // Generic efficiency erosion.
    return {
      signal: "Efficiency erosion",
      why: `The primary result is getting more expensive without a single dominant cause in the supporting metrics — a broad, gradual decline.`,
      action: "Review recent changes, pause the weakest ad sets, and re-test creative and audience against the objective's KPI.",
    };
  }

  if (better) {
    if (spendUp) {
      return {
        signal: "Healthy scaling",
        why: `Spend is up ${fmtPctChange(d.dSpend)} while the objective's KPI held or improved — the campaign is absorbing budget without losing efficiency.`,
        action: "Keep scaling, but raise the daily budget by ≤20% at a time so the learning phase does not reset.",
      };
    }
    return {
      signal: "Improving efficiency",
      why: `The objective's KPI improved versus its comparison point with no offsetting weakness in the supporting metrics.`,
      action: "Protect what is working; consider a measured budget increase and hold creative steady.",
    };
  }

  // Traffic-quality caution (attention up, quality down) even when KPI ~flat.
  if (ctrRising && cvrFalling) {
    return {
      signal: "Traffic-quality drift",
      why: `More people are clicking (CTR ${fmtPctChange(d.dCtr)}) but fewer convert (${fmtPctChange(downRate)}) — attention is up while traffic quality softens.`,
      action: "Check placement/audience quality and post-click relevance before this feeds into a higher result cost.",
    };
  }

  if (spendUp) {
    return {
      signal: "Healthy scaling",
      why: `Spend rose ${fmtPctChange(d.dSpend)} with efficiency roughly stable against the objective's KPI.`,
      action: "Continue scaling in ≤20% steps and keep an eye on frequency and conversion rate.",
    };
  }

  return {
    signal: "On track",
    why: "No monitored relationship crossed a meaningful threshold; the campaign is steady against its objective.",
    action: "No change needed this week. Keep monitoring the objective's KPI.",
  };
}

function fmtPctChange(n: number | null): string {
  if (n === null) return "n/a";
  return `${n > 0 ? "+" : ""}${n.toFixed(0)}%`;
}

/* ========================================================================== */
/* Engine                                                                      */
/* ========================================================================== */

const WINDOW_DAYS = 7;

/** Objective importance weighting for prioritization (lower funnel matters more). */
const OBJECTIVE_WEIGHT: Record<ObjectiveFamily, number> = {
  sales: 1,
  app: 0.95,
  leads: 0.9,
  traffic_lpv: 0.65,
  traffic_clicks: 0.55,
  engagement: 0.5,
  video: 0.45,
  awareness: 0.4,
};

function tierFromPriority(p: number): PriorityTier {
  if (p >= 70) return "Critical";
  if (p >= 45) return "High";
  if (p >= 22) return "Medium";
  return "Low";
}

function analyzeCampaign(c: CampaignInput, todayIso: string): CampaignFinding {
  const sorted = [...c.days].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((d) => d.date < todayIso);
  const curDays = sorted.slice(-WINDOW_DAYS);
  const prevDays = sorted.slice(-WINDOW_DAYS * 2, -WINDOW_DAYS);
  const cur = aggregate(curDays);
  const prev = aggregate(prevDays);

  const family = normalizeFamily(c);
  const primary = resolvePrimary(family, cur);
  const prevPrimary = resolvePrimary(family, prev);

  const timing = computeTiming(c.startDate ?? null, c.endDate ?? null, todayIso);
  const cols = supportingColumns(family, cur);

  // ---- Deltas (relationships) ----
  const d: Deltas = {
    dPrimary: changePct(primary.value, prevPrimary.value),
    dCtr: changePct(cur.ctr, prev.ctr),
    dCvr: changePct(cur.cvr, prev.cvr),
    dCpm: changePct(cur.cpm, prev.cpm),
    dCpc: changePct(cur.cpc, prev.cpc),
    dFreq: changePct(cur.frequency, prev.frequency),
    dSpend: changePct(cur.spend, prev.spend),
    dReach: changePct(cur.reachAvgDaily, prev.reachAvgDaily),
    dConv: changePct(cur.conversions, prev.conversions),
    dClicks: changePct(cur.clicks, prev.clicks),
    dLeadRate: changePct(cur.leadRate, prev.leadRate),
    dLpvRate: changePct(cur.lpvRate, prev.lpvRate),
    dViewRate: changePct(cur.viewRate, prev.viewRate),
    dCompletion: changePct(cur.completionRate, prev.completionRate),
    dHook: changePct(cur.hookRate, prev.hookRate),
  };

  const evidence = buildEvidence(family, cur, prev, primary);

  // ---- State resolution ----
  const state = resolveState(c, family, cur, prev, sorted, todayIso);

  // ---- Error detection (highest precedence for a genuine data problem) ----
  const err = detectError(c, family, cur, prev);

  // ---- Comparison source + ratio ----
  const cmp = resolveComparison(c, family, primary, cur, prev);

  // ---- Diagnosis (independent of the final label) ----
  const worse = isWorse(primary.better, d.dPrimary);
  const betterMove = isBetter(primary.better, d.dPrimary);
  const diagnosis = diagnose(family, c.platform, c.campaignType ?? null, cur, prev, d, worse, betterMove);

  // ---- Confidence ----
  const confidence = resolveConfidence(family, cur, prev, cmp.kind);

  // ---- Performance verdict (precedence: Error → maturity → zero-conv → data → ratio) ----
  let performance: Performance;
  let signal = diagnosis.signal;
  let why = diagnosis.why;
  let action = diagnosis.action;

  const zeroConv = isConversionFamily(family) && resultVolume(family, cur) === 0;
  const enoughEvidenceForZero = cur.clicks >= 300 && cur.spend >= 100 && cur.days >= WINDOW_DAYS;

  if (err) {
    performance = "Error";
    ({ signal, why, action } = err);
  } else if (isMaturityInReview(state)) {
    performance = "In Review";
    ({ signal, why, action } = inReviewNarrative(state, cmp.kind, family, cur));
  } else if (zeroConv) {
    if (enoughEvidenceForZero) {
      performance = "Low";
      signal = "No conversions";
      why = `Enough valid traffic this week (${int(cur.clicks)} clicks, ${money0(cur.spend)} spent) but zero recorded conversions — the objective is not being met.`;
      action =
        "Confirm tracking is firing, then treat this as a real conversion problem: review the offer, landing page and audience, and pause if it does not recover.";
    } else {
      performance = "In Review";
      signal = "Insufficient results";
      why = `Zero conversions on only ${int(cur.clicks)} clicks / ${money0(cur.spend)} spent — too little evidence to call it underperformance yet.`;
      action = "Give it more delivery before judging; there is not enough traffic to conclude anything.";
    }
  } else if (isDataInReview(cmp.kind, family, cur)) {
    performance = "In Review";
    ({ signal, why, action } = inReviewNarrative(state, cmp.kind, family, cur));
  } else {
    performance = verdictFromRatio(cmp.ratio, confidence, betterMove);
    if (performance === "Low" && confidence === "Low") performance = "In Review";
  }

  // ---- Exposure / budget-at-risk + priority ----
  const exposure = computeExposure(family, primary, cur, cmp);
  const priority = computePriority(family, performance, cmp, cur, exposure, confidence, d);
  const priorityTier = tierFromPriority(priority);

  return {
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    platform: c.platform,
    objective: c.objective,
    objectiveFamily: family,
    objectiveLabel: FAMILY_LABEL[family],
    optimizationGoal: c.optimizationGoal ?? null,
    campaignType: c.campaignType ?? null,
    bidStrategy: c.bidStrategy ?? null,
    conversionGoal: c.conversionGoal ?? null,
    campaignState: state,
    campaignStateLabel: STATE_LABEL[state],
    performance,
    primaryMetric: primary.label,
    primaryMetricValue: primary.fmt(primary.value),
    comparisonSource: cmp.kind,
    comparisonLabel: cmp.label,
    targetOrBaseline: cmp.targetLabel,
    signal,
    why,
    action,
    evidence,
    supportingColumns: cols,
    diagnosticConfidence: confidence,
    priority,
    priorityTier,
    exposure,
    spend: Number(cur.spend.toFixed(2)),
    timing,
  };
}

function isWorse(better: "high" | "low", dPrimary: number | null): boolean {
  if (dPrimary === null) return false;
  return better === "high" ? dPrimary <= -8 : dPrimary >= 8;
}
function isBetter(better: "high" | "low", dPrimary: number | null): boolean {
  if (dPrimary === null) return false;
  return better === "high" ? dPrimary >= 8 : dPrimary <= -8;
}

function buildEvidence(
  family: ObjectiveFamily,
  cur: WindowMetrics,
  prev: WindowMetrics,
  primary: PrimaryKpi,
): EvidenceRow[] {
  const row = (
    label: string,
    curV: number,
    prevV: number,
    fmt: (n: number) => string,
    meaning?: (up: boolean) => string,
    isPrimary = false,
  ): EvidenceRow => {
    const ch = changePct(curV, prevV);
    return {
      label,
      current: fmt(curV),
      previous: fmt(prevV),
      changePct: ch,
      direction: dir(ch),
      meaning: ch !== null && meaning ? meaning(ch > 0) : undefined,
      primary: isPrimary,
    };
  };

  const base: EvidenceRow[] = [row("Spend", cur.spend, prev.spend, money)];
  const kpi = row(primary.label, primary.value, resolvePrimary(family, prev).value, primary.fmt, undefined, true);
  const rows: EvidenceRow[] = [base[0], kpi];

  const common: Record<ObjectiveFamily, EvidenceRow[]> = {
    sales: [
      row("Conversions", cur.conversions, prev.conversions, int, (u) => (u ? "more results" : "fewer results")),
      row("CVR", cur.cvr, prev.cvr, pct, (u) => (u ? "more clicks convert" : "fewer clicks convert")),
      row("CTR", cur.ctr, prev.ctr, pct, (u) => (u ? "more people click" : "fewer people click")),
      row("CPM", cur.cpm, prev.cpm, money, (u) => (u ? "costs more to show" : "cheaper to show")),
      row("Frequency", cur.frequency, prev.frequency, freqFmt, (u) => (u ? "seen more often" : "seen less often")),
    ],
    leads: [
      row("Leads", cur.leads, prev.leads, int),
      row("Click→lead", cur.leadRate, prev.leadRate, pct, (u) => (u ? "more clicks become leads" : "fewer clicks become leads")),
      row("CTR", cur.ctr, prev.ctr, pct),
      row("CPC", cur.cpc, prev.cpc, money),
    ],
    traffic_lpv: [
      row("LPVs", cur.landingPageViews, prev.landingPageViews, int),
      row("LPV rate", cur.lpvRate, prev.lpvRate, pct, (u) => (u ? "more clicks load the page" : "more clicks bounce before load")),
      row("CTR", cur.ctr, prev.ctr, pct),
      row("CPC", cur.cpc, prev.cpc, money),
    ],
    traffic_clicks: [
      row("Clicks", cur.clicks, prev.clicks, int),
      row("CTR", cur.ctr, prev.ctr, pct),
      row("CPM", cur.cpm, prev.cpm, money),
    ],
    engagement: [
      row("Clicks", cur.clicks, prev.clicks, int),
      row("CTR", cur.ctr, prev.ctr, pct),
    ],
    video: [
      row("Views", cur.focusedViews > 0 ? cur.focusedViews : cur.videoViews, prev.focusedViews > 0 ? prev.focusedViews : prev.videoViews, int),
      row("View rate", cur.viewRate, prev.viewRate, pct, (u) => (u ? "more people watch" : "fewer people watch")),
      row("2s hook rate", cur.hookRate, prev.hookRate, pct, (u) => (u ? "stronger hook" : "weaker hook")),
      row("Completion", cur.completionRate, prev.completionRate, pct),
    ],
    awareness: [
      row("Reach", cur.reachAvgDaily, prev.reachAvgDaily, int),
      row("Frequency", cur.frequency, prev.frequency, freqFmt, (u) => (u ? "seen more often" : "seen less often")),
      row("Impressions", cur.impressions, prev.impressions, int),
    ],
    app: [
      row("Installs", cur.installs, prev.installs, int),
      row("CVR", cur.cvr, prev.cvr, pct),
      row("CTR", cur.ctr, prev.ctr, pct),
    ],
  };

  for (const r of common[family]) {
    if (!rows.some((x) => x.label === r.label)) rows.push(r);
  }
  return rows;
}

/* ---- State resolution ---- */
function resolveState(
  c: CampaignInput,
  family: ObjectiveFamily,
  cur: WindowMetrics,
  prev: WindowMetrics,
  allDays: DailyMetric[],
  todayIso: string,
): CampaignState {
  if (c.learningStatus === "learning_limited") return "learning_limited";
  if (c.learningStatus === "learning") return "learning";
  if (lc(c.status).includes("limited")) return "limited_by_budget";

  const activeDays = allDays.filter((d) => d.spend > 0).length;
  if (c.startDate) {
    const age = daysBetween(c.startDate, todayIso);
    if (age >= 0 && age < 7) return "new";
  }
  if (c.lastMajorEditDate) {
    const since = daysBetween(c.lastMajorEditDate, todayIso);
    if (since >= 0 && since < WINDOW_DAYS) return "recently_edited";
  }
  if (prev.days < WINDOW_DAYS || activeDays < WINDOW_DAYS + 1) return "insufficient_history";
  if (resultVolume(family, cur) < MIN_RESULTS[family] / 2) return "insufficient_volume";
  return "active";
}

/** Maturity states that make a campaign not-yet-judgeable regardless of metrics. */
function isMaturityInReview(state: CampaignState): boolean {
  return (
    state === "learning" ||
    state === "learning_limited" ||
    state === "new" ||
    state === "recently_edited" ||
    state === "insufficient_history"
  );
}

/** Data-quality reasons to withhold a verdict (no comparison / too few results). */
function isDataInReview(cmp: ComparisonKind, family: ObjectiveFamily, cur: WindowMetrics): boolean {
  if (cmp === "none") return true;
  if (resultVolume(family, cur) < MIN_RESULTS[family] / 2) return true;
  return false;
}

function inReviewNarrative(
  state: CampaignState,
  cmp: ComparisonKind,
  family: ObjectiveFamily,
  cur: WindowMetrics,
): Diagnosis {
  if (state === "learning" || state === "learning_limited")
    return {
      signal: "Learning phase",
      why: "The campaign is still in the platform learning phase, so results are unstable and not yet representative.",
      action: "Leave budget and targeting unchanged until it exits learning — edits now reset the phase.",
    };
  if (state === "new")
    return {
      signal: "New campaign",
      why: "The campaign is only a few days old, so there is not yet a stable read on its objective.",
      action: "Give it a full week of steady delivery before judging performance.",
    };
  if (state === "recently_edited")
    return {
      signal: "Recently edited",
      why: "A major edit inside the current window means the numbers mix two setups and cannot be compared cleanly yet.",
      action: "Hold changes and re-assess after a full week on the new setup.",
    };
  if (state === "insufficient_history")
    return {
      signal: "Insufficient history",
      why: "There is not enough comparable prior data to measure a change against.",
      action: "Keep it running; a verdict becomes possible once a full prior week exists.",
    };
  if (cmp === "none")
    return {
      signal: "No comparison point",
      why: "There is no configured target, no stable own baseline, and no comparable campaigns — so a defensible verdict cannot be issued yet.",
      action: "Set a target for this objective, or let the campaign build a stable baseline.",
    };
  return {
    signal: "Insufficient results",
    why: `Only ${int(resultVolume(family, cur))} results in the window — too few to judge the objective's KPI reliably.`,
    action: "Continue collecting results before making a major optimization.",
  };
}

/* ---- Error detection ---- */
function detectError(
  c: CampaignInput,
  family: ObjectiveFamily,
  cur: WindowMetrics,
  prev: WindowMetrics,
): Diagnosis | null {
  // Explicit platform/integration measurement failure.
  if (c.tracking?.measurementError) {
    return {
      signal: "Tracking failure",
      why: "The platform reported a measurement/integration failure, so conversion data for this campaign cannot be trusted.",
      action: "Fix the tracking integration (pixel / conversions API / offline import) before judging performance.",
    };
  }
  if (c.tracking?.conversionTrackingActive === false && isConversionFamily(family)) {
    return {
      signal: "Conversion tracking down",
      why: "Conversion tracking is not active for this campaign, so recorded results are missing regardless of real performance.",
      action: "Restore the conversion event/tag; until then no conversion verdict is valid.",
    };
  }
  // Malformed / impossible data.
  if (cur.clicks > cur.impressions || cur.spend < 0 || cur.conversions > cur.clicks * 1.2) {
    return {
      signal: "Impossible data",
      why: "The reported figures are internally inconsistent (e.g. more clicks than impressions), which points to a data pipeline problem.",
      action: "Re-sync the account data; the current numbers cannot be analyzed.",
    };
  }
  // Disappearing conversion measurement: healthy clicks + previously converting, now
  // a hard zero across the whole window (a measurement drop, not gradual decline).
  const resPrev = resultVolume(family, prev);
  const resCur = resultVolume(family, cur);
  if (
    isConversionFamily(family) &&
    resPrev >= MIN_RESULTS[family] &&
    resCur === 0 &&
    cur.clicks >= prev.clicks * 0.7 &&
    cur.clicks >= 200
  ) {
    return {
      signal: "Conversions stopped recording",
      why: `Clicks are steady (${int(cur.clicks)}) but recorded results dropped from ${int(resPrev)} to zero across the whole window — a hard stop like this is almost always a tracking break, not real demand.`,
      action: "Check the conversion event/pixel and server events immediately; treat the zero as unmeasured until confirmed.",
    };
  }
  return null;
}

function isConversionFamily(family: ObjectiveFamily): boolean {
  return family === "sales" || family === "leads" || family === "app";
}

/* ---- Comparison source ---- */
type Comparison = {
  kind: ComparisonKind;
  ratio: number; // >1 means better than comparison (direction-normalized)
  label: string;
  targetLabel: string | null;
};

function resolveComparison(
  c: CampaignInput,
  family: ObjectiveFamily,
  primary: PrimaryKpi,
  cur: WindowMetrics,
  prev: WindowMetrics,
): Comparison {
  const value = primary.value;
  const ratioTo = (t: number) =>
    !Number.isFinite(value) || value <= 0 || !Number.isFinite(t) || t <= 0
      ? Number.NaN
      : primary.better === "high"
        ? value / t
        : t / value;

  // 1. Configured target matching the primary KPI.
  if (c.target && primary.targetType && c.target.type === primary.targetType) {
    const r = ratioTo(c.target.value);
    if (Number.isFinite(r)) {
      return {
        kind: "target",
        ratio: r,
        label: `${primary.label} target`,
        targetLabel: `Target ${primary.label} ${primary.fmt(c.target.value)}`,
      };
    }
  }

  // 2. Own stable historical baseline (previous window), when there is enough history.
  const prevPrimary = resolvePrimary(family, prev).value;
  if (Number.isFinite(prevPrimary) && prevPrimary > 0 && prev.days >= WINDOW_DAYS) {
    const r = ratioTo(prevPrimary);
    if (Number.isFinite(r)) {
      return {
        kind: "baseline",
        ratio: r,
        label: "Own prior-week baseline",
        targetLabel: `Baseline ${primary.label} ${primary.fmt(prevPrimary)}`,
      };
    }
  }

  // 3. Comparable peers are provided by the engine (set post-hoc); handled there.
  return { kind: "none", ratio: Number.NaN, label: "No comparison", targetLabel: null };
}

/* ---- Confidence ---- */
function resolveConfidence(
  family: ObjectiveFamily,
  cur: WindowMetrics,
  prev: WindowMetrics,
  cmp: ComparisonKind,
): Confidence {
  const vol = resultVolume(family, cur);
  const min = MIN_RESULTS[family];
  let score = 0;
  if (vol >= min * 2) score += 2;
  else if (vol >= min) score += 1.2;
  else if (vol >= min / 2) score += 0.6;
  if (cur.days >= WINDOW_DAYS && prev.days >= WINDOW_DAYS) score += 1;
  else if (cur.days >= WINDOW_DAYS) score += 0.4;
  if (cmp === "target") score += 1;
  else if (cmp === "baseline" || cmp === "peers") score += 0.6;
  if (score >= 3) return "High";
  if (score >= 1.8) return "Medium";
  return "Low";
}

/* ---- Verdict from ratio ---- */
function verdictFromRatio(ratio: number, confidence: Confidence, betterMove: boolean): Performance {
  if (!Number.isFinite(ratio)) return "In Review";
  if (ratio >= 1.12) return "High";
  if (ratio >= 0.85) return "Moderate";
  // Below comparison. Trending up strongly can soften to Moderate; else Low.
  if (betterMove && ratio >= 0.72) return "Moderate";
  return confidence === "Low" ? "In Review" : "Low";
}

/* ---- Exposure / budget-at-risk ---- */
function computeExposure(
  family: ObjectiveFamily,
  primary: PrimaryKpi,
  cur: WindowMetrics,
  cmp: Comparison,
): Exposure {
  const lowerFunnel = family === "sales" || family === "leads" || family === "app" || family === "traffic_lpv";
  if (lowerFunnel && Number.isFinite(cmp.ratio) && cmp.ratio < 1 && cmp.kind !== "none") {
    // Defensible overspend: the share of spend that missed the target this week.
    const waste = cur.spend * Math.min(1, 1 - cmp.ratio);
    return { kind: "budget_at_risk", amount: Number(waste.toFixed(2)), label: "Budget at risk" };
  }
  return { kind: "spend_exposure", amount: Number(cur.spend.toFixed(2)), label: "Spend at stake" };
}

/* ---- Priority ---- */
function computePriority(
  family: ObjectiveFamily,
  performance: Performance,
  cmp: Comparison,
  cur: WindowMetrics,
  exposure: Exposure,
  confidence: Confidence,
  d: Deltas,
): number {
  const sev =
    performance === "Error"
      ? 1.0
      : performance === "Low"
        ? 0.9
        : performance === "In Review"
          ? 0.28
          : performance === "Moderate"
            ? 0.45
            : 0.12; // High
  const spendExposure = Math.min(cur.spend / 3000, 1); // 0..1
  const magnitude = Number.isFinite(cmp.ratio) ? Math.min(Math.max(1 - cmp.ratio, 0) / 0.5, 1) : 0.3;
  const conf = confidence === "High" ? 1 : confidence === "Medium" ? 0.75 : 0.5;
  const budgetAtRisk = exposure.kind === "budget_at_risk" ? Math.min(exposure.amount / 1500, 1) : 0;
  const objW = OBJECTIVE_WEIGHT[family];

  const raw =
    sev * 45 +
    spendExposure * 18 * objW +
    magnitude * 14 +
    budgetAtRisk * 15 +
    (family === "sales" ? 5 : 0);
  return Number((raw * (0.6 + 0.4 * conf)).toFixed(2));
}

/* ---- Peer comparison fill (cross-campaign) ---- */
function applyPeerComparisons(findings: CampaignFinding[], byCampaign: Map<string, { c: CampaignInput; cur: WindowMetrics; primary: PrimaryKpi }>): void {
  // Group judgeable campaigns lacking target+baseline by platform+family+goal.
  const groups = new Map<string, { id: string; value: number; better: "high" | "low" }[]>();
  for (const [, v] of byCampaign) {
    const key = `${v.c.platform}|${normalizeFamily(v.c)}|${lc(v.c.optimizationGoal)}|${lc(v.c.campaignType)}`;
    const val = v.primary.value;
    if (!Number.isFinite(val) || val <= 0) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: v.c.campaignId, value: val, better: v.primary.better });
  }

  for (const f of findings) {
    if (f.comparisonSource !== "none") continue;
    const v = byCampaign.get(f.campaignId);
    if (!v) continue;
    const key = `${f.platform}|${f.objectiveFamily}|${lc(f.optimizationGoal)}|${lc(f.campaignType)}`;
    const peers = (groups.get(key) ?? []).filter((p) => p.id !== f.campaignId);
    if (peers.length < 2) continue; // need ≥2 comparable peers
    const values = peers.map((p) => p.value).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    const primary = v.primary;
    if (!Number.isFinite(primary.value) || primary.value <= 0 || median <= 0) continue;
    const ratio = primary.better === "high" ? primary.value / median : median / primary.value;
    f.comparisonSource = "peers";
    f.comparisonLabel = "Similar campaigns";
    f.targetOrBaseline = `Peer median ${primary.label} ${primary.fmt(median)}`;
    // Re-derive verdict now that a comparison exists (unless In Review/Error from state).
    if (f.performance === "In Review" && (f.signal === "No comparison point")) {
      const conf = f.diagnosticConfidence;
      f.performance = verdictFromRatio(ratio, conf, false);
      if (f.performance === "Low" && conf === "Low") f.performance = "In Review";
    }
  }
}

export function analyzeCampaigns(
  campaigns: CampaignInput[],
  todayIso: string = new Date().toISOString().slice(0, 10),
): AnalysisResult {
  const findings: CampaignFinding[] = [];
  const byCampaign = new Map<string, { c: CampaignInput; cur: WindowMetrics; primary: PrimaryKpi }>();
  let totalSpend = 0;

  // Window labels from the first campaign that has data.
  let currentWindow = { start: "", end: "" };
  let previousWindow = { start: "", end: "" };

  for (const c of campaigns) {
    const sorted = [...c.days].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((d) => d.date < todayIso);
    const curDays = sorted.slice(-WINDOW_DAYS);
    const prevDays = sorted.slice(-WINDOW_DAYS * 2, -WINDOW_DAYS);
    if (curDays.length && !currentWindow.start) {
      currentWindow = { start: curDays[0].date, end: curDays[curDays.length - 1].date };
      previousWindow = prevDays.length
        ? { start: prevDays[0].date, end: prevDays[prevDays.length - 1].date }
        : { start: "", end: "" };
    }
    const f = analyzeCampaign(c, todayIso);
    findings.push(f);
    totalSpend += f.spend;
    byCampaign.set(c.campaignId, {
      c,
      cur: aggregate(curDays),
      primary: resolvePrimary(normalizeFamily(c), aggregate(curDays)),
    });
  }

  applyPeerComparisons(findings, byCampaign);

  // Priority-ranked (most urgent first).
  findings.sort((a, b) => b.priority - a.priority);

  return {
    currentWindow,
    previousWindow,
    totalSpend: Number(totalSpend.toFixed(2)),
    generatedAt: new Date().toISOString(),
    findings,
  };
}
