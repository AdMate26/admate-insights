import { createServerFn } from "@tanstack/react-start";

import { type AnalysisResult } from "./analysis/engine";
import { verifyOwnerAccess, type OwnerAccess } from "./auth/viewer.server";
import {
  brandPlatforms,
  DEFAULT_BRAND,
  isBrand,
  isLiveBrand,
  isWorkspaceBrand,
  resolveBrandPlatform,
  type Brand,
  type LiveBrand,
  type WorkspaceBrand,
} from "./brands";
import type { LiveConnection } from "./live-connection";
import { isPlatform, type Platform } from "./platforms";
import { computeAnalysis, renderBriefingText, sendBrandBriefing } from "./telegram/dispatch.server";
import {
  getScheduleForBrand,
  setScheduleEnabled,
  upsertSchedule,
  type StoredSchedule,
} from "./telegram/schedules.server";
import { createTelegramActions, type ScheduleInput } from "./telegram/owner-actions";
import { browserTimezone, type DeliveryType } from "./telegram/schedule-model";

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
  brand: WorkspaceBrand;
  brandLabel: string;
  platform: Platform;
  provider: string;
  providerLabel: string;
  modeLabel: string;
  /** Where the campaigns came from. "meta_live" is owner-only real data. */
  source: "demo" | "meta_live";
  /** Live connection status (account, counts, or a safe error); null for demo. */
  live: LiveConnection | null;
  /** "disabled" = no AI narrative requested (live data in this first stage). */
  aiStatus: "ok" | "failed" | "disabled";
  aiError: string | null;
};

// Short-lived in-memory cache PER (BRAND, PLATFORM): the demo data is
// deterministic, so re-running the AI narrative call on every navigation only
// adds latency.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: AdMateAnalysis }>();
const cacheKey = (brand: WorkspaceBrand, platform: Platform) => `${brand}:${platform}`;
// Live results are re-read sooner; a failed live read is never cached, so a
// fixed token or a recovered Meta API is picked up on the next request.
const LIVE_CACHE_TTL_MS = 2 * 60 * 1000;

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

/** Demo brands plus live brands — used ONLY by the analysis functions below. */
function coerceWorkspaceBrand(input: unknown): WorkspaceBrand {
  const value =
    input && typeof input === "object" && "brand" in input
      ? (input as { brand?: unknown }).brand
      : input;
  return isWorkspaceBrand(value) ? value : DEFAULT_BRAND;
}

function coerceScope(input: unknown): { brand: WorkspaceBrand; platform: Platform } {
  const brand = coerceWorkspaceBrand(input);
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
 * Owner gate for live brands. Runs BEFORE the cache is consulted, so cached live
 * data can never be served to anyone but the verified owner. Demo brands need
 * no identity at all (they stay public).
 */
async function requireAccess(brand: WorkspaceBrand): Promise<OwnerAccess | null> {
  if (!isLiveBrand(brand)) return null;
  const access = await verifyOwnerAccess();
  if (!access) throw new Error("This workspace isn't available.");
  return access;
}

/** One (brand, platform) analysis behind the per-(brand, platform) cache. */
async function cachedAnalysis(
  brand: WorkspaceBrand,
  platform: Platform,
  access: OwnerAccess | null,
): Promise<AdMateAnalysis> {
  const key = cacheKey(brand, platform);
  const ttl = isLiveBrand(brand) ? LIVE_CACHE_TTL_MS : CACHE_TTL_MS;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await computeAnalysis(brand, platform, access);
  if (value.live?.status !== "error") cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Gather one brand's analyses — one per connected platform, each analysed on its
 * own. The owner check (live brands only) happens once, up front.
 */
async function gatherBrandAnalyses(brand: WorkspaceBrand): Promise<AdMateAnalysis[]> {
  const access = await requireAccess(brand);
  return Promise.all(
    brandPlatforms(brand).map((platform) => cachedAnalysis(brand, platform, access)),
  );
}

export const getAdMateAnalysis = createServerFn({ method: "GET" })
  .validator((input: { brand?: WorkspaceBrand; platform?: Platform } | undefined) =>
    coerceScope(input),
  )
  .handler(async ({ data }): Promise<AdMateAnalysis> => {
    const { brand, platform } = data;
    const access = await requireAccess(brand);
    return cachedAnalysis(brand, platform, access);
  });

/**
 * Every connected platform's analysis for one brand, in one call — powers
 * Overview, the shell and Alerts. Scoped to the brand's connected platforms.
 */
export const getAllAnalyses = createServerFn({ method: "GET" })
  .validator((input: { brand?: WorkspaceBrand } | undefined) => ({
    brand: coerceWorkspaceBrand(input),
  }))
  .handler(async ({ data }): Promise<AdMateAnalysis[]> => gatherBrandAnalyses(data.brand));

/**
 * Which live brands the current signed-in user may open. Only the verified
 * owner (META_OWNER_USER_ID) gets the live "My Account" brand; everyone else —
 * including anonymous visitors — gets an empty list.
 */
export const getWorkspaceAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ liveBrands: LiveBrand[] }> => {
    const access = await verifyOwnerAccess();
    return { liveBrands: access ? ["my_account"] : [] };
  },
);

/* -------------------------------------------------------------------------- */
/* Telegram briefings — owner only                                            */
/* -------------------------------------------------------------------------- */

// Preview, Send Now and the schedule functions below are callable from any
// browser, so each one re-checks the caller ON THE SERVER before it builds a
// briefing, calls Telegram or touches telegram_schedules: only the verified
// owner (Supabase-validated token whose user id equals META_OWNER_USER_ID) gets
// through; everyone else receives one generic error. Hiding the buttons in the
// UI is a convenience, not the protection. The scheduled cron runner does not
// use these functions (it is authorised by CRON_SECRET in api/cron).
// A function (not a module-level call) so the server-only wiring is only ever
// reached from inside the handlers, which never run in the browser bundle.
function telegram() {
  return createTelegramActions({
    verifyOwner: verifyOwnerAccess,
    renderBriefingText,
    sendBrandBriefing,
    getScheduleForBrand,
    upsertSchedule,
    setScheduleEnabled,
  });
}

/**
 * Preview the EXACT briefing that would be sent — reuses the one dispatcher, so
 * it works with no Telegram credentials and never requires a successful send.
 * The briefing spans the brand's connected platforms and counts only
 * Performance = Low.
 */
export const previewBriefing = createServerFn({ method: "GET" })
  .validator((input: { brand?: Brand } | undefined) => ({ brand: coerceBrand(input) }))
  .handler(async ({ data }) => telegram().preview(data));

/** Send Now — preserves the working Telegram behaviour via the shared sender. */
export const sendTelegramBriefing = createServerFn({ method: "POST" })
  .validator((input: { chatId?: string; brand?: Brand } | undefined) => ({
    chatId: input?.chatId?.trim() || undefined,
    brand: coerceBrand(input),
  }))
  .handler(async ({ data }) => telegram().send(data));

/* -------------------------------------------------------------------------- */
/* Telegram schedules (persisted; executed server-side by the Vercel cron)     */
/* -------------------------------------------------------------------------- */

function coerceScheduleInput(input: unknown): ScheduleInput {
  const o = (input ?? {}) as Record<string, unknown>;
  const deliveryType = (
    ["daily", "weekly", "monthly"].includes(String(o.deliveryType)) ? o.deliveryType : "daily"
  ) as DeliveryType;
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
  .handler(async ({ data }): Promise<{ configured: boolean; schedule: StoredSchedule | null }> =>
    telegram().getSchedule(data),
  );

/** Create/replace a brand's schedule. Persisted; the cron runner executes it. */
export const saveTelegramSchedule = createServerFn({ method: "POST" })
  .validator(coerceScheduleInput)
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; schedule: StoredSchedule } | { ok: false; error: string }> =>
      telegram().saveSchedule(data),
  );

/** Enable or disable an existing schedule without deleting it. */
export const setTelegramScheduleEnabled = createServerFn({ method: "POST" })
  .validator((input: { brand?: Brand; enabled?: boolean } | undefined) => ({
    brand: coerceBrand(input),
    enabled: Boolean((input as { enabled?: boolean } | undefined)?.enabled),
  }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; schedule: StoredSchedule | null } | { ok: false; error: string }> =>
      telegram().setScheduleEnabled(data),
  );
