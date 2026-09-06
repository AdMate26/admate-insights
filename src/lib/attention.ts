import type { CampaignFinding } from "./analysis/engine";

/**
 * SINGLE SOURCE OF TRUTH for "Needs attention".
 *
 * A campaign needs attention ONLY when its Performance verdict is exactly "Low"
 * (the primary objective KPI is materially underperforming with enough valid
 * evidence to judge it). Priority/exposure, In Review, Error, Moderate and High
 * never count here. This reads the verdict the engine already assigned.
 */
export const isNeedsAttention = (f: CampaignFinding): boolean => f.performance === "Low";

/** Data/tracking problems that block analysis — surfaced separately, never counted. */
export const isError = (f: CampaignFinding): boolean => f.performance === "Error";

/** Too early/unstable to judge — surfaced separately, never counted. */
export const isInReview = (f: CampaignFinding): boolean => f.performance === "In Review";

export const needsAttentionCount = (findings: CampaignFinding[]): number =>
  findings.filter(isNeedsAttention).length;
