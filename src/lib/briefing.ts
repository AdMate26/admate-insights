import type { AnalysisResult, CampaignFinding } from "./analysis/engine";
import { isError, isInReview, isNeedsAttention } from "./attention";
import { type Platform } from "./platforms";

/**
 * Pure Telegram briefing builder (no runtime imports) so it is unit testable.
 * Delivery lives in admate.functions and is unchanged — this only builds text.
 *
 * The briefing is CROSS-PLATFORM and powered by the SAME engine result as the
 * dashboard: it counts only Performance = "Low" as "needs attention", expands
 * full details for those, lists Error/tracking problems separately, shows an
 * In-Review count, and omits High/Moderate. No new facts are invented.
 */
export type BriefingInput = Pick<
  AnalysisResult,
  "currentWindow" | "previousWindow" | "totalSpend" | "findings"
> & { platform: Platform };

const SHORT_LABEL: Record<Platform, string> = {
  tiktok: "TikTok Ads",
  meta: "Meta Ads",
  google_search: "Google Search",
};
const PLATFORM_ORDER: Platform[] = ["tiktok", "meta", "google_search"];

function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Up to 3 plain-English evidence lines: the primary KPI, then supporting moves. */
function keyEvidence(f: CampaignFinding): string[] {
  const lines: string[] = [];
  const cmp = f.targetOrBaseline ?? f.comparisonLabel;
  lines.push(`${f.primaryMetric} ${f.primaryMetricValue}${cmp ? ` vs ${cmp}` : ""}`);
  const supporting = f.evidence
    .filter((e) => e.label !== "Spend" && e.meaning && e.changePct !== null && Math.abs(e.changePct) >= 1)
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
    .slice(0, 2);
  for (const e of supporting) {
    const up = e.changePct! > 0;
    lines.push(`${e.label} ${up ? "↑" : "↓"}${Math.round(Math.abs(e.changePct!))}% — ${e.meaning}`);
  }
  return lines;
}

function detailBlock(platform: Platform, f: CampaignFinding): string[] {
  const action = f.aiRecommendedAction ?? f.action;
  return [
    "",
    "──────────",
    `🔴 <b>${escapeHtml(SHORT_LABEL[platform])} — ${escapeHtml(f.campaignName)}</b>`,
    `${f.performance} · ${escapeHtml(f.objectiveLabel)}`,
    "",
    "<b>WHAT'S GOING WRONG</b>",
    escapeHtml(f.signal),
    "",
    "<b>KEY EVIDENCE</b>",
    ...keyEvidence(f).map(escapeHtml),
    "",
    "<b>WHAT TO DO NOW</b>",
    escapeHtml(action),
    "",
    `Confidence: ${f.diagnosticConfidence}`,
  ];
}

export function buildBriefing(platforms: BriefingInput[]): string {
  const ordered = [...platforms].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  );

  const lowByPlatform = new Map<Platform, CampaignFinding[]>();
  const errors: { platform: Platform; f: CampaignFinding }[] = [];
  let totalLow = 0;
  let inReview = 0;

  for (const p of ordered) {
    const low = p.findings.filter(isNeedsAttention);
    lowByPlatform.set(p.platform, low);
    totalLow += low.length;
    inReview += p.findings.filter(isInReview).length;
    for (const f of p.findings.filter(isError)) errors.push({ platform: p.platform, f });
  }

  const lines: string[] = [
    "<b>AdMate Briefing</b>",
    "",
    `🔴 <b>${totalLow} ${totalLow === 1 ? "campaign needs" : "campaigns need"} attention</b>`,
  ];
  for (const p of ordered) {
    lines.push(`${SHORT_LABEL[p.platform]}: ${lowByPlatform.get(p.platform)!.length}`);
  }

  // Full details for Low campaigns only (most urgent first, already priority-sorted).
  for (const p of ordered) {
    for (const f of lowByPlatform.get(p.platform)!) lines.push(...detailBlock(p.platform, f));
  }

  // Errors / tracking problems — surfaced separately, never counted as attention.
  if (errors.length > 0) {
    lines.push("", "──────────", "🛑 <b>Data / tracking to fix</b>");
    for (const { platform, f } of errors) {
      lines.push(`${escapeHtml(SHORT_LABEL[platform])} — ${escapeHtml(f.campaignName)}: ${escapeHtml(f.signal)}`);
    }
  }

  // In Review — compact count only.
  if (inReview > 0) {
    lines.push("", `⏳ ${inReview} campaign${inReview === 1 ? "" : "s"} in review (too early or unstable to judge).`);
  }

  if (totalLow === 0 && errors.length === 0) {
    lines.push("", "✅ Nothing needs attention this week — all judged campaigns are on track.");
  }

  return lines.join("\n");
}

export function briefingPlainText(platforms: BriefingInput[]): string {
  return buildBriefing(platforms)
    .replace(/<\/?(b|i)>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
