import { createServerFn } from "@tanstack/react-start";

import { runAnalysis, type AnalysisResult, type CampaignFinding } from "./analysis/engine";
import { DemoTikTokDataProvider } from "./tiktok/demo-provider";
import { loadNormalizedDailyRows } from "./tiktok/normalize";

/**
 * MVP keeps everything in-memory: the demo provider is deterministic, so the
 * same synthetic history (and therefore the same findings) is reproduced on
 * every call. No persistence is required for the demo to function.
 */
const HISTORY_DAYS = 28;

export type AdMateAnalysis = AnalysisResult & {
  provider: string;
  providerLabel: string;
  aiStatus: "ok" | "failed";
  aiError: string | null;
};

// Short-lived in-memory cache: the demo data is deterministic, so re-running the
// AI narrative call on every navigation only adds latency (and can time out).
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: AdMateAnalysis } | undefined;

async function computeAnalysis(): Promise<AdMateAnalysis> {

    const provider = new DemoTikTokDataProvider();

    // 1 + 2. Provider -> normalization layer -> single internal schema.
    const rows = await loadNormalizedDailyRows(provider, HISTORY_DAYS);

    // 3. Deterministic engine owns metrics, signal, severity, evidence, confidence.
    const result = runAnalysis(rows, 7);

    // 4. AI layer adds ONLY possibleExplanation + recommendedAction.
    let aiStatus: "ok" | "failed" = "ok";
    let aiError: string | null = null;
    try {
      const { explainFindings } = await import("./ai/explain.server");
      const narratives = await explainFindings(result.findings);
      for (const finding of result.findings) {
        const narrative = narratives.find((n) => n.campaignId === finding.campaignId);
        if (!narrative) continue;
        finding.aiExplanation = narrative.possibleExplanation;
        finding.aiRecommendedAction = narrative.recommendedAction;
      }
    } catch (error) {
      aiStatus = "failed";
      aiError = error instanceof Error ? error.message : String(error);
      console.error("AI explanation layer failed", error);
    }

    return {
      ...result,
      provider: provider.id,
      providerLabel: provider.label,
      aiStatus,
      aiError,
    };
}

export const getAdMateAnalysis = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdMateAnalysis> => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    const value = await computeAnalysis();
    cached = { at: Date.now(), value };
    return value;
  },
);


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

function buildBriefing(analysis: AdMateAnalysis): string {
  const priority = analysis.findings.filter((f) => f.needsAttention).slice(0, 5);
  const lines: string[] = [
    "<b>AdMate briefing — TikTok Ads (demo data)</b>",
    `Window: ${analysis.currentWindow.start} → ${analysis.currentWindow.end} vs ${analysis.previousWindow.start} → ${analysis.previousWindow.end}`,
    `Spend in window: $${analysis.totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} · ${priority.length} campaigns need attention`,
    "",
  ];
  priority.forEach((f: CampaignFinding, i) => {
    lines.push(
      `${SEVERITY_ICON[f.severity] ?? "⚪"} <b>${i + 1}. ${escapeHtml(f.campaignName)}</b> — ${escapeHtml(f.statusLabel)} · ${escapeHtml(f.signalLabel)}`,
      `<i>What changed:</i> ${escapeHtml(f.whatChanged)}`,
    );
    if (f.aiExplanation) lines.push(`<i>Possible explanation:</i> ${escapeHtml(f.aiExplanation)}`);
    if (f.aiRecommendedAction)
      lines.push(`<b>Recommended action:</b> ${escapeHtml(f.aiRecommendedAction)}`);
    lines.push(`<i>Confidence:</i> ${f.confidence} (deterministic)`, "");
  });
  if (priority.length === 0) lines.push("No campaign crossed an attention threshold this week.", "");
  lines.push("Signals, metrics, severity and confidence computed in code; AI wrote interpretation only.");
  return lines.join("\n");
}

/** Plain-text render of the same digest, for reviewing it before Telegram is connected. */
export const previewBriefing = createServerFn({ method: "GET" }).handler(async () => {
  const analysis = await getAdMateAnalysis();
  return {
    text: buildBriefing(analysis)
      .replace(/<\/?(b|i)>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  };
});

export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .validator((input: { chatId?: string }) => ({ chatId: input?.chatId?.trim() || undefined }))
  .handler(async ({ data }) => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) {
      return { ok: false as const, error: "Telegram bot token is not configured yet." };
    }
    const chatId = data.chatId ?? process.env["TELEGRAM_CHAT_ID"];
    if (!chatId) {
      return { ok: false as const, error: "Enter the Telegram chat ID to send the briefing." };
    }

    const analysis = await getAdMateAnalysis();
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildBriefing(analysis),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const body = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !body.ok) {
      return { ok: false as const, error: body.description ?? `Telegram error ${response.status}` };
    }
    return { ok: true as const };
  });
