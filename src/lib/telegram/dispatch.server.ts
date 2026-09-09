/**
 * ONE briefing generator + ONE Telegram sender.
 *
 * Preview Message, Send Now and the scheduled cron runner all go through here,
 * so the message a reviewer previews is byte-for-byte what gets sent. This
 * module has NO dependency on @tanstack/react-start (it must be callable both
 * from server functions and from the plain Vercel cron function), and reuses
 * the existing analysis engine + briefing renderer untouched.
 */

import type { AdMateAnalysis } from "../admate.functions"; // type-only → erased at build (no runtime cycle)
import { analyzeCampaigns } from "../analysis/engine";
import { getDemoCampaignsForBrand } from "../analysis/demo";
import { brandMeta, brandPlatforms, type Brand } from "../brands";
import { buildBriefing, briefingPlainText } from "../briefing";
import { platformMeta, type Platform } from "../platforms";

/** Analyse one (brand, platform) and attach the best-effort AI narrative. */
export async function computeAnalysis(brand: Brand, platform: Platform): Promise<AdMateAnalysis> {
  const result = analyzeCampaigns(getDemoCampaignsForBrand(brand, platform));

  let aiStatus: "ok" | "failed" = "ok";
  let aiError: string | null = null;
  try {
    const { explainFindings } = await import("../ai/explain.server");
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

/** One brand's analyses across its connected platforms (no cache — callers may add one). */
export async function computeBrandAnalyses(brand: Brand): Promise<AdMateAnalysis[]> {
  return Promise.all(brandPlatforms(brand).map((platform) => computeAnalysis(brand, platform)));
}

/** Plain-text briefing (preview) — the exact content, no Telegram markup. */
export async function renderBriefingText(brand: Brand): Promise<string> {
  return briefingPlainText(await computeBrandAnalyses(brand));
}

/** HTML briefing (what Telegram receives). */
export async function renderBriefingHtml(brand: Brand): Promise<string> {
  return buildBriefing(await computeBrandAnalyses(brand));
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Send a brand's briefing to Telegram. Bot token stays server-side; an explicit
 * chatId overrides the TELEGRAM_CHAT_ID fallback. Returns a clean result rather
 * than throwing so callers (UI + cron) can report failures without crashing.
 */
export async function sendBrandBriefing(brand: Brand, chatId?: string): Promise<SendResult> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return { ok: false, error: "Telegram bot token is not configured yet." };
  const cid = (chatId && chatId.trim()) || process.env["TELEGRAM_CHAT_ID"];
  if (!cid) return { ok: false, error: "Enter the Telegram chat ID to send the briefing." };

  try {
    const html = await renderBriefingHtml(brand);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cid,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const body = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !body.ok) {
      return { ok: false, error: body.description ?? `Telegram error ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send to Telegram." };
  }
}
