import { createServerFn } from "@tanstack/react-start";

import { analyzeCampaigns, type AnalysisResult } from "./analysis/engine";
import { getDemoCampaigns } from "./analysis/demo";
import { buildBriefing, briefingPlainText } from "./briefing";
import { DEFAULT_PLATFORM, isPlatform, platformMeta, type Platform } from "./platforms";

/**
 * MVP keeps everything in-memory: the demo campaigns are deterministic, so the
 * same synthetic history (and therefore the same findings) is reproduced on
 * every call. No persistence is required for the demo to function.
 */
export type AdMateAnalysis = AnalysisResult & {
  platform: Platform;
  provider: string;
  providerLabel: string;
  modeLabel: string;
  aiStatus: "ok" | "failed";
  aiError: string | null;
};

// Short-lived in-memory cache PER PLATFORM: the demo data is deterministic, so
// re-running the AI narrative call on every navigation only adds latency.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<Platform, { at: number; value: AdMateAnalysis }>();

async function computeAnalysis(platform: Platform): Promise<AdMateAnalysis> {
  // 1 + 2. Objective-aware demo campaigns -> the ONE analysis engine. The same
  //        result powers Campaigns, Overview, Needs Attention, Telegram & reports.
  const result = analyzeCampaigns(getDemoCampaigns(platform));

  // 3. AI layer only REPHRASES the deterministic diagnosis (explanation + action).
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
    platform,
    provider: `${platform}-demo`,
    providerLabel: `${platformMeta(platform).label} (synthetic demo)`,
    modeLabel: platformMeta(platform).modeLabel,
    aiStatus,
    aiError,
  };
}

function coercePlatform(input: unknown): Platform {
  const value =
    input && typeof input === "object" && "platform" in input
      ? (input as { platform?: unknown }).platform
      : input;
  return isPlatform(value) ? value : DEFAULT_PLATFORM;
}

const ALL_PLATFORMS: Platform[] = ["tiktok", "meta", "google_search"];

/** Gather every platform's analysis for the cross-platform Telegram briefing. */
async function gatherAllAnalyses(): Promise<AdMateAnalysis[]> {
  return Promise.all(ALL_PLATFORMS.map((platform) => getAdMateAnalysis({ data: { platform } })));
}

export const getAdMateAnalysis = createServerFn({ method: "GET" })
  .validator((input: { platform?: Platform } | undefined) => ({
    platform: coercePlatform(input),
  }))
  .handler(async ({ data }): Promise<AdMateAnalysis> => {
    const platform = data.platform;
    const hit = cache.get(platform);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const value = await computeAnalysis(platform);
    cache.set(platform, { at: Date.now(), value });
    return value;
  });

/**
 * Plain-text render of the CROSS-PLATFORM digest (Telegram preview). The briefing
 * spans all platforms and counts only Performance Rating = Needs Attention.
 */
export const previewBriefing = createServerFn({ method: "GET" }).handler(async () => {
  const analyses = await gatherAllAnalyses();
  return { text: briefingPlainText(analyses) };
});

export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .validator((input: { chatId?: string } | undefined) => ({
    chatId: input?.chatId?.trim() || undefined,
  }))
  .handler(async ({ data }) => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) {
      return { ok: false as const, error: "Telegram bot token is not configured yet." };
    }
    const chatId = data.chatId ?? process.env["TELEGRAM_CHAT_ID"];
    if (!chatId) {
      return { ok: false as const, error: "Enter the Telegram chat ID to send the briefing." };
    }

    const analyses = await gatherAllAnalyses();
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildBriefing(analyses),
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
