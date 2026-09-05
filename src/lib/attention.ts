import type { CampaignFinding } from "./analysis/engine";

/**
 * SINGLE SOURCE OF TRUTH for "Needs Attention".
 *
 * A campaign counts as Needs Attention ONLY when its Performance Rating is
 * exactly "Needs Attention". Priority/severity, Check Data, Early Data, Fair,
 * Good and Very Good never count. This does not touch analysis logic — it only
 * reads the rating the engine already assigned.
 */
export const isNeedsAttention = (f: CampaignFinding): boolean =>
  f.performanceRating === "Needs Attention";

/** No-score campaigns whose tracking looks unreliable (shown separately, never counted). */
export const isCheckData = (f: CampaignFinding): boolean => f.performanceLabel === "Check Data";

/** New / low-volume campaigns still gathering data (shown as a count, never counted as attention). */
export const isEarlyData = (f: CampaignFinding): boolean => f.performanceLabel === "Early Data";

export const isFair = (f: CampaignFinding): boolean => f.performanceRating === "Fair";

/** Count of campaigns whose Performance Rating is exactly "Needs Attention". */
export const needsAttentionCount = (findings: CampaignFinding[]): number =>
  findings.filter(isNeedsAttention).length;
