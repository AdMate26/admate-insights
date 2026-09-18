import type { AnalysisResult, CampaignFinding } from "./analysis/engine";
import { isError, isHighPerformance, isInReview, isNeedsAttention } from "./attention";
import { platformMeta, type Platform } from "./platforms";

/**
 * Pure Telegram briefing builder (no runtime imports) so it is unit testable.
 * Delivery lives in admate.functions and is unchanged — this only builds text.
 *
 * The briefing is a CONCISE cross-platform ALERT that surfaces BOTH extremes of
 * the existing performance verdict:
 *   🔴 need attention     — Performance === "Low"
 *   🟢 performing strongly — Performance === "High" (the single highest state)
 * "Moderate" (Good/Fair) is intentionally never alerted. Under each platform it
 * lists the affected objectives (counted), then a separate one-line count of
 * data issues (Error) and In-Review campaigns, and a link back to AdMate for the
 * detail. It omits per-campaign evidence, explanations, recommendations and
 * confidence — those live in the app. No new facts are invented and no scoring
 * changes: it only reads verdicts the engine already assigned.
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
 * One bullet per affected objective on this set of campaigns, counted and
 * ordered by frequency (then alphabetically):
 *   • Sales (2)
 *   • Lead generation (1)
 */
function objectiveBullets(findings: CampaignFinding[]): string[] {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.objectiveLabel, (counts.get(f.objectiveLabel) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, n]) => `• ${escapeHtml(label)} (${n})`);
}

/**
 * One performance section: an emoji + count header, then a bold "Platform: N"
 * line and its objective bullets for every platform with at least one matching
 * campaign. Platforms with a zero count are omitted entirely.
 */
function performanceSection(
  ordered: BriefingInput[],
  match: (f: CampaignFinding) => boolean,
  total: number,
  header: (n: number) => string,
): string[] {
  const lines = ["", header(total)];
  for (const p of ordered) {
    const hits = p.findings.filter(match);
    if (hits.length === 0) continue;
    lines.push("");
    lines.push(`<b>${escapeHtml(shortLabel(p.platform))}: ${hits.length}</b>`);
    for (const bullet of objectiveBullets(hits)) lines.push(bullet);
  }
  return lines;
}

export type BriefingOptions = { appUrl?: string };

export function buildBriefing(platforms: BriefingInput[], opts: BriefingOptions = {}): string {
  const appUrl = opts.appUrl ?? DEFAULT_APP_URL;
  const ordered = [...platforms].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
  );

  let totalLow = 0;
  let totalHigh = 0;
  let dataIssues = 0;
  let inReview = 0;
  for (const p of ordered) {
    totalLow += p.findings.filter(isNeedsAttention).length;
    totalHigh += p.findings.filter(isHighPerformance).length;
    dataIssues += p.findings.filter(isError).length;
    inReview += p.findings.filter(isInReview).length;
  }

  const lines: string[] = ["<b>AdMate Briefing</b>"];

  // 🔴 Needs attention (Performance = "Low"). Always show the summary count.
  lines.push(
    ...performanceSection(
      ordered,
      isNeedsAttention,
      totalLow,
      (n) => `🔴 <b>${n} ${n === 1 ? "campaign needs" : "campaigns need"} attention</b>`,
    ),
  );

  // 🟢 Performing strongly (Performance = "High"). Always show the summary count.
  lines.push(
    ...performanceSection(
      ordered,
      isHighPerformance,
      totalHigh,
      (n) => `🟢 <b>${n} ${n === 1 ? "campaign" : "campaigns"} performing strongly</b>`,
    ),
  );

  // Data issues (Error) and In Review — kept SEPARATE, never in either count.
  // Surfaced only when present, to keep the alert scannable.
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
