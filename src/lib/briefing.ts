import type { AnalysisResult, CampaignFinding } from "./analysis/engine";
import { isError, isInReview, isNeedsAttention } from "./attention";
import { platformMeta, type Platform } from "./platforms";

/**
 * Pure Telegram briefing builder (no runtime imports) so it is unit testable.
 * Delivery lives in admate.functions and is unchanged — this only builds text.
 *
 * The briefing is a CONCISE cross-platform ALERT: a per-platform count of
 * campaigns that need attention (Performance = "Low") with the affected
 * objectives, then a separate one-line count of data issues (Error) and
 * In-Review campaigns, and a link back to AdMate for the detail. It deliberately
 * omits per-campaign evidence, explanations, recommendations and confidence —
 * those live in the app. No new facts are invented.
 */
export type BriefingInput = Pick<
  AnalysisResult,
  "currentWindow" | "previousWindow" | "totalSpend" | "findings"
> & { platform: Platform };

/** Where "View details in AdMate" points. Override per-call via opts.appUrl. */
const DEFAULT_APP_URL = "https://admate-insights.vercel.app";

const SHORT_LABEL: Partial<Record<Platform, string>> = {
  tiktok: "TikTok Ads",
  meta: "Meta Ads",
  google_search: "Google Search",
  linkedin: "LinkedIn Ads",
};
const PLATFORM_ORDER: Platform[] = ["tiktok", "meta", "google_search", "linkedin"];

// Never crash on an unmapped platform: fall back to the platform registry label.
function shortLabel(p: Platform): string {
  return SHORT_LABEL[p] ?? platformMeta(p).label;
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One bullet per affected objective on this platform's Low campaigns, counted
 * and ordered by frequency (then alphabetically):
 *   • Sales (2)
 *   • Lead generation (1)
 */
function objectiveBullets(low: CampaignFinding[]): string[] {
  const counts = new Map<string, number>();
  for (const f of low) counts.set(f.objectiveLabel, (counts.get(f.objectiveLabel) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, n]) => `• ${escapeHtml(label)} (${n})`);
}

export type BriefingOptions = { appUrl?: string };

export function buildBriefing(platforms: BriefingInput[], opts: BriefingOptions = {}): string {
  const appUrl = opts.appUrl ?? DEFAULT_APP_URL;
  const ordered = [...platforms].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  );

  let totalLow = 0;
  let dataIssues = 0;
  let inReview = 0;
  const attention: { platform: Platform; low: CampaignFinding[] }[] = [];

  for (const p of ordered) {
    const low = p.findings.filter(isNeedsAttention);
    totalLow += low.length;
    dataIssues += p.findings.filter(isError).length;
    inReview += p.findings.filter(isInReview).length;
    // Only platforms with at least one Needs Attention campaign are listed.
    if (low.length > 0) attention.push({ platform: p.platform, low });
  }

  const lines: string[] = [
    "<b>AdMate Briefing</b>",
    "",
    `🔴 <b>${totalLow} ${totalLow === 1 ? "campaign needs" : "campaigns need"} attention</b>`,
  ];

  for (const { platform, low } of attention) {
    lines.push("");
    lines.push(`<b>${escapeHtml(shortLabel(platform))}: ${low.length}</b>`);
    for (const bullet of objectiveBullets(low)) lines.push(bullet);
  }

  // Data issues (Error) and In Review — kept SEPARATE, never in the attention
  // count. Surfaced only when present, to keep the alert scannable.
  if (dataIssues > 0 || inReview > 0) {
    lines.push("");
    if (dataIssues > 0)
      lines.push(`🛑 ${dataIssues} data issue${dataIssues === 1 ? "" : "s"} detected`);
    if (inReview > 0)
      lines.push(`⏳ ${inReview} campaign${inReview === 1 ? "" : "s"} in review`);
  }

  lines.push("");
  lines.push(`👉 <a href="${appUrl}">View details in AdMate</a>`);

  return lines.join("\n");
}

export function briefingPlainText(platforms: BriefingInput[], opts: BriefingOptions = {}): string {
  return buildBriefing(platforms, opts)
    .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, "$2: $1")
    .replace(/<\/?(b|i)>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
