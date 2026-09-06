import { createServerFn } from "@tanstack/react-start";

import { analyzeCampaigns, type AnalysisResult } from "./analysis/engine";
import { getDemoCampaignsForBrand } from "./analysis/demo";
import {
  brandMeta,
  brandPlatforms,
  DEFAULT_BRAND,
  isBrand,
  resolveBrandPlatform,
  type Brand,
} from "./brands";
import { buildBriefing, briefingPlainText } from "./briefing";
import { isPlatform, platformMeta, type Platform } from "./platforms";

/**
 * MVP keeps everything in-memory: the demo campaigns are deterministic, so the
 * same synthetic history (and therefore the same findings) is reproduced on
 * every call. No persistence is required for the demo to function.
 *
 * A **brand** is an organisational scope only: the analysis below is still run
 * per platform, on that brand's connected accounts, by the SAME analyzer —
 * platforms are never blended together under a brand.
 */
export type AdMateAnalysis = AnalysisResult & {
  brand: Brand;
  brandLabel: string;
  platform: Platform;
  provider: string;
  providerLabel: string;
  modeLabel: string;
  aiStatus: "ok" | "failed";
  aiError: string | null;
};

// Short-lived in-memory cache PER (BRAND, PLATFORM): the demo data is
// deterministic, so re-running the AI narrative call on every navigation only
// adds latency.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: AdMateAnalysis }>();
const cacheKey = (brand: Brand, platform: Platform) => `${brand}:${platform}`;

async function computeAnalysis(brand: Brand, platform: Platform): Promise<AdMateAnalysis> {
  // 1 + 2. This brand's campaigns for THIS platform -> the ONE analysis engine.
  //        The same result powers Campaigns, Overview, Needs Attention, Telegram
  //        & reports. The engine only ever sees a single platform's campaigns
  //        here, so platform-specific rules never mix.
  const result = analyzeCampaigns(getDemoCampaignsForBrand(brand, platform));

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
    brand,
    brandLabel: brandMeta(brand).label,
    platform,
    provider: `${brand}-${platform}-demo`,
    providerLabel: `${brandMeta(brand).label} · ${platformMeta(platform).label} (synthetic demo)`,
    modeLabel: platformMeta(platform).modeLabel,
    aiStatus,
    aiError,
  };
}

function coerceBrand(input: unknown): Brand {
  const value =
    input && typeof input === "object" && "brand" in input
      ? (input as { brand?: unknown }).brand
      : input;
  return isBrand(value) ? value : DEFAULT_BRAND;
}

function coerceScope(input: unknown): { brand: Brand; platform: Platform } {
  const brand = coerceBrand(input);
  const rawPlatform =
    input && typeof input === "object" && "platform" in input
      ? (input as { platform?: unknown }).platform
      : undefined;
  // Keep platform switching *inside* the brand: an un-connected platform is
  // clamped to the brand's first connected platform.
  const platform = resolveBrandPlatform(brand, isPlatform(rawPlatform) ? rawPlatform : undefined);
  return { brand, platform };
}

/**
 * Gather one brand's analyses — one per connected platform, each analysed on its
 * own. This is the list the cross-platform Telegram briefing reads for the brand.
 */
async function gatherBrandAnalyses(brand: Brand): Promise<AdMateAnalysis[]> {
  return Promise.all(
    brandPlatforms(brand).map((platform) => getAdMateAnalysis({ data: { brand, platform } })),
  );
}

export const getAdMateAnalysis = createServerFn({ method: "GET" })
  .validator((input: { brand?: Brand; platform?: Platform } | undefined) => coerceScope(input))
  .handler(async ({ data }): Promise<AdMateAnalysis> => {
    const { brand, platform } = data;
    const key = cacheKey(brand, platform);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const value = await computeAnalysis(brand, platform);
    cache.set(key, { at: Date.now(), value });
    return value;
  });

/**
 * Every connected platform's analysis for one brand, in one call — powers
 * Overview, the shell and Alerts. Scoped to the brand's connected platforms.
 */
export const getAllAnalyses = createServerFn({ method: "GET" })
  .validator((input: { brand?: Brand } | undefined) => ({ brand: coerceBrand(input) }))
  .handler(async ({ data }): Promise<AdMateAnalysis[]> => gatherBrandAnalyses(data.brand));

/**
 * Plain-text render of the CROSS-PLATFORM digest for one brand (Telegram
 * preview). The briefing spans the brand's connected platforms and counts only
 * Performance = Low.
 */
export const previewBriefing = createServerFn({ method: "GET" })
  .validator((input: { brand?: Brand } | undefined) => ({ brand: coerceBrand(input) }))
  .handler(async ({ data }) => {
    const analyses = await gatherBrandAnalyses(data.brand);
    return { text: briefingPlainText(analyses) };
  });

export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .validator((input: { chatId?: string; brand?: Brand } | undefined) => ({
    chatId: input?.chatId?.trim() || undefined,
    brand: coerceBrand(input),
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

    const analyses = await gatherBrandAnalyses(data.brand);
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
