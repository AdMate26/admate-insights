import type { AnalysisResult, CampaignFinding } from "./analysis/engine";
import { platformMeta, type Platform } from "./platforms";

/**
 * Pure Telegram briefing builder (no server/runtime imports) so it is unit
 * testable. The Telegram DELIVERY mechanism lives in admate.functions and is
 * unchanged — this only produces the message text for the selected platform.
 */
export type BriefingInput = Pick<
  AnalysisResult,
  "currentWindow" | "previousWindow" | "totalSpend" | "findings"
> & { platform: Platform };

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
  info: "🟢",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildBriefing(analysis: BriefingInput): string {
  const platformLabel = platformMeta(analysis.platform).label;
  const priority = analysis.findings.filter((f) => f.needsAttention).slice(0, 5);
  const lines: string[] = [
    `<b>AdMate briefing — ${escapeHtml(platformLabel)} (demo data)</b>`,
    `Window: ${analysis.currentWindow.start} → ${analysis.currentWindow.end} vs ${analysis.previousWindow.start} → ${analysis.previousWindow.end}`,
    `Spend in window: $${analysis.totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} · ${priority.length} campaigns need attention`,
    "",
  ];
  priority.forEach((f: CampaignFinding, i) => {
    // Customer-facing label: the simple Performance rating + score, or the
    // code-owned label ("Early Data" / "Check Data") when there is no score.
    // Signal stays visible — it explains why.
    const score = f.performanceScore ?? "—";
    lines.push(
      `${SEVERITY_ICON[f.severity] ?? "⚪"} <b>${i + 1}. ${escapeHtml(f.campaignName)}</b> — ${escapeHtml(f.performanceLabel)} ${score} · ${escapeHtml(f.signalLabel)}`,
      `<i>What changed:</i> ${escapeHtml(f.whatChanged)}`,
    );
    if (f.aiExplanation) lines.push(`<i>Possible explanation:</i> ${escapeHtml(f.aiExplanation)}`);
    // For data-confidence cases (e.g. possible tracking issue) use the
    // deterministic guidance action; otherwise use the AI recommendation.
    const action = f.guidance?.action ?? f.aiRecommendedAction;
    if (action) lines.push(`<b>Recommended action:</b> ${escapeHtml(action)}`);
    lines.push(`<i>Confidence:</i> ${f.confidence} (deterministic)`, "");
  });
  if (priority.length === 0) lines.push("No campaign crossed an attention threshold this week.", "");
  lines.push(
    `Signals, metrics, severity and confidence computed in code by the ${escapeHtml(platformLabel)} analyzer; AI wrote interpretation only.`,
  );
  return lines.join("\n");
}

/** Plain-text render of the same digest (Telegram preview before connecting). */
export function briefingPlainText(analysis: BriefingInput): string {
  return buildBriefing(analysis)
    .replace(/<\/?(b|i)>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
