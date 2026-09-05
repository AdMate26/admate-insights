import { createServerFn } from "@tanstack/react-start";

import {
  runAnalysis,
  runMetaAnalysis,
  runGoogleSearchAnalysis,
  type AnalysisResult,
} from "./analysis/engine";
import type { NormalizedDailyRow } from "./tiktok/contract";
import { DemoTikTokDataProvider } from "./tiktok/demo-provider";
import { DemoMetaDataProvider } from "./meta/demo-provider";
import { DemoGoogleSearchDataProvider } from "./google/demo-provider";
import { loadNormalizedDailyRows } from "./tiktok/normalize";
import { buildBriefing, briefingPlainText } from "./briefing";
import { DEFAULT_PLATFORM, isPlatform, platformMeta, type Platform } from "./platforms";

/**
 * MVP keeps everything in-memory: each demo provider is deterministic, so the
 * same synthetic history (and therefore the same findings) is reproduced on
 * every call. No persistence is required for the demo to function.
 */
const HISTORY_DAYS = 28;

export type AdMateAnalysis = AnalysisResult & {
  platform: Platform;
  provider: string;
  providerLabel: string;
  modeLabel: string;
  aiStatus: "ok" | "failed";
  aiError: string | null;
};

/**
 * Platform registry — the ONE place platform → (own demo provider + own
 * analyzer) is wired. Each platform runs its OWN analyzer; data and logic never
 * mix. The AI layer is shared and only writes narrative from the findings.
 */
type Analyzer = (rows: NormalizedDailyRow[], windowDays?: number) => AnalysisResult;

const ANALYZER: Record<Platform, Analyzer> = {
  tiktok: runAnalysis,
  meta: runMetaAnalysis,
  google_search: runGoogleSearchAnalysis,
};

/** Load + normalize a platform's demo rows with the provider's concrete type. */
async function loadPlatformRows(
  platform: Platform,
): Promise<{ rows: NormalizedDailyRow[]; id: string; label: string }> {
  switch (platform) {
    case "meta": {
      const p = new DemoMetaDataProvider();
      return { rows: await loadNormalizedDailyRows(p, HISTORY_DAYS), id: p.id, label: p.label };
    }
    case "google_search": {
      const p = new DemoGoogleSearchDataProvider();
      return { rows: await loadNormalizedDailyRows(p, HISTORY_DAYS), id: p.id, label: p.label };
    }
    case "tiktok":
    default: {
      const p = new DemoTikTokDataProvider();
      return { rows: await loadNormalizedDailyRows(p, HISTORY_DAYS), id: p.id, label: p.label };
    }
  }
}

// Short-lived in-memory cache PER PLATFORM: the demo data is deterministic, so
// re-running the AI narrative call on every navigation only adds latency.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<Platform, { at: number; value: AdMateAnalysis }>();

async function computeAnalysis(platform: Platform): Promise<AdMateAnalysis> {
  // 1 + 2. Provider -> normalization layer -> single internal schema.
  const { rows, id, label } = await loadPlatformRows(platform);

  // 3. Deterministic PLATFORM-SPECIFIC analyzer owns metrics, signal, severity,
  //    evidence, confidence — TikTok / Meta / Google Search each run their own.
  const result = ANALYZER[platform](rows, 7);

  // 4. AI layer adds ONLY possibleExplanation + recommendedAction (unchanged).
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
    provider: id,
    providerLabel: label,
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

/** Plain-text render of the same digest, for reviewing it before Telegram is connected. */
export const previewBriefing = createServerFn({ method: "GET" })
  .validator((input: { platform?: Platform } | undefined) => ({
    platform: coercePlatform(input),
  }))
  .handler(async ({ data }) => {
    const analysis = await getAdMateAnalysis({ data: { platform: data.platform } });
    return { text: briefingPlainText(analysis) };
  });

export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .validator((input: { chatId?: string; platform?: Platform }) => ({
    chatId: input?.chatId?.trim() || undefined,
    platform: coercePlatform(input),
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

    const analysis = await getAdMateAnalysis({ data: { platform: data.platform } });
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
