---
name: admate-analysis-engine
description: "Change or review AdMate deterministic marketing metrics, signal thresholds, status, severity, confidence, and analysis evidence."
---

# AdMate analysis engine

Read `src/lib/analysis/engine.ts` completely, then `src/lib/tiktok/contract.ts`, `normalize.ts`, and `demo-provider.ts`. Use the implementation as the current baseline, not marketing wording in the README.

## Invariants
- Compute ratios from summed totals, not averages of row-level ratios. CTR/CVR are fractions internally; snapshot CTR is a percentage. CPA, CPC, CPM, ROAS, and frequency have different denominators.
- Zero/invalid denominators yield NaN internally; comparisons return null for invalid values or a zero prior value. Evidence uses `n/a`; snapshots currently coerce unavailable ratios to zero. Keep that distinction visible in tests.
- One finding is selected per campaign by an ordered cascade: low volume → tracking issue → creative fatigue → CPA deterioration → CPM spike → CTR drop → scaling efficiency → strong improvement → stable. Ordering is behavior when several rules match.
- Status is separate from severity. `needsAttention` is derived from `status === "needs_attention"`; high severity does not automatically mean attention. Findings sort by `severityScore` descending.
- Confidence is a code-owned heuristic based on volume, consistency, magnitude, and completeness, with Low caps for low-volume and tracking findings. Do not present it as a calibrated probability or statistical proof.
- AI must never assign or overwrite computed fields.

## Change workflow
Describe the expected input/output difference before adjusting a rule. Test boundaries immediately below, at, and above the changed thresholds and overlapping-rule priority. Check the matching evidence description and status reasoning as well as the signal. For confidence changes, test caps independently of score.

## Current limitations to preserve or address explicitly
`selectWindows` slices the latest distinct available dates before UTC today; it does not fill missing calendar days. Completeness currently counts rows, not distinct campaign-days. Frequency divides summed impressions by summed daily reach, which is not deduplicated period reach. These matter for sparse or multi-ad live input; characterize them before an authorized correction instead of claiming calendar completeness or unique reach.

Freeze the clock for demo regression fixtures: seeded values are stable for campaign/date but dates and generatedAt move with time. Nine named demo scenarios express intent; verify actual classified outputs instead of forcing classifications from campaign IDs. Include empty input, missing days, multiple ads per day, zero denominators, today's rows, stable ordering, and non-mutation of input when relevant. Keep numeric tests independent of live AI/network calls.
