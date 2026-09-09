import { createServerFn } from "@tanstack/react-start";

import { type AnalysisResult } from "./analysis/engine";
import {
  brandPlatforms,
  DEFAULT_BRAND,
  isBrand,
  resolveBrandPlatform,
  type Brand,
} from "./brands";
import { isPlatform, type Platform } from "./platforms";
import {
  computeAnalysis,
  renderBriefingText,
  sendBrandBriefing,
} from "./telegram/dispatch.server";
import {
  getScheduleForBrand,
  setScheduleEnabled,
  upsertSchedule,
  type StoredSchedule,
} from "./telegram/schedules.server";
import {
  browserTimezone,
  validateSchedule,
  type DeliveryType,
} from "./telegram/schedule-model";

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

// Analysis generation now lives in ./telegram/dispatch.server (the single source
// of truth shared by the UI, preview, Send Now and the cron runner). This module
// only adds the per-(brand,platform) cache used by the interactive UI.

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
/**
 * Preview the EXACT briefing that would be sent — reuses the one dispatcher, so
 * it works with no Telegram credentials and never requires a successful send.
 */
export const previewBriefing = createServerFn({ method: "GET" })
  .validator((input: { brand?: Brand } | undefined) => ({ brand: coerceBrand(input) }))
  .handler(async ({ data }) => {
    return { text: await renderBriefingText(data.brand) };
  });

/** Send Now — preserves the working Telegram behaviour via the shared sender. */
export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .validator((input: { chatId?: string; brand?: Brand } | undefined) => ({
    chatId: input?.chatId?.trim() || undefined,
    brand: coerceBrand(input),
  }))
  .handler(async ({ data }) => {
    const result = await sendBrandBriefing(data.brand, data.chatId);
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
  });

/* -------------------------------------------------------------------------- */
/* Telegram schedules (persisted; executed server-side by the Vercel cron)     */
/* -------------------------------------------------------------------------- */

function coerceScheduleInput(input: unknown): {
  brand: Brand;
  deliveryType: DeliveryType;
  time: string;
  timezone: string;
  weekday: number | null;
  dayOfMonth: number | null;
} {
  const o = (input ?? {}) as Record<string, unknown>;
  const deliveryType = (["daily", "weekly", "monthly"].includes(String(o.deliveryType))
    ? o.deliveryType
    : "daily") as DeliveryType;
  return {
    brand: coerceBrand(input),
    deliveryType,
    time: typeof o.time === "string" ? o.time : "09:00",
    timezone: typeof o.timezone === "string" && o.timezone ? o.timezone : browserTimezone(),
    weekday: typeof o.weekday === "number" ? o.weekday : null,
    dayOfMonth: typeof o.dayOfMonth === "number" ? o.dayOfMonth : null,
  };
}

/** Current saved schedule for a brand. `configured:false` when storage is unavailable. */
export const getTelegramSchedule = createServerFn({ method: "GET" })
  .validator((input: { brand?: Brand } | undefined) => ({ brand: coerceBrand(input) }))
  .handler(async ({ data }): Promise<{ configured: boolean; schedule: StoredSchedule | null }> => {
    try {
      const schedule = await getScheduleForBrand(data.brand);
      return { configured: true, schedule };
    } catch (error) {
      console.error("getTelegramSchedule failed", error);
      return { configured: false, schedule: null };
    }
  });

/** Create/replace a brand's schedule. Persisted; the cron runner executes it. */
export const saveTelegramSchedule = createServerFn({ method: "POST" })
  .validator(coerceScheduleInput)
  .handler(async ({ data }): Promise<{ ok: true; schedule: StoredSchedule } | { ok: false; error: string }> => {
    const invalid = validateSchedule(data);
    if (invalid) return { ok: false, error: invalid };
    try {
      const schedule = await upsertSchedule(data.brand, {
        deliveryType: data.deliveryType,
        time: data.time,
        timezone: data.timezone,
        weekday: data.weekday,
        dayOfMonth: data.dayOfMonth,
      });
      return { ok: true, schedule };
    } catch (error) {
      console.error("saveTelegramSchedule failed", error);
      return { ok: false, error: "Unable to save schedule." };
    }
  });

/** Enable or disable an existing schedule without deleting it. */
export const setTelegramScheduleEnabled = createServerFn({ method: "POST" })
  .validator((input: { brand?: Brand; enabled?: boolean } | undefined) => ({
    brand: coerceBrand(input),
    enabled: Boolean((input as { enabled?: boolean } | undefined)?.enabled),
  }))
  .handler(async ({ data }): Promise<{ ok: true; schedule: StoredSchedule | null } | { ok: false; error: string }> => {
    try {
      const schedule = await setScheduleEnabled(data.brand, data.enabled);
      return { ok: true, schedule };
    } catch (error) {
      console.error("setTelegramScheduleEnabled failed", error);
      return { ok: false, error: "Unable to update schedule." };
    }
  });
