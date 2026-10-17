/**
 * Brand registry (display metadata only — client-safe).
 *
 * A **Brand** is purely an ORGANISATIONAL layer on top of the existing
 * platform-specific analysis: Brand → connected platform → that platform's
 * campaigns → that platform's existing analyzer. A brand never introduces a
 * blended cross-platform rule; it only scopes *which* platform accounts and
 * campaigns are in view.
 *
 * Like `platforms.ts`, this module holds NO campaign data or analyzers so it
 * can be imported by the UI without pulling server-only demo code into the
 * client bundle. The server side (admate.functions + analysis/demo) maps each
 * (brand, platform) pair to its own synthetic accounts.
 */

import { isPlatform, type Platform } from "./platforms";

export type Brand = "northlane" | "olive" | "kite";

export type BrandMeta = {
  id: Brand;
  /** Switcher / header label. */
  label: string;
  /** One-line description of the account. */
  blurb: string;
  /**
   * Platforms this brand has connected, in display order. Only these platforms
   * are ever shown or analysed for the brand — a brand is never graded on a
   * platform it hasn't connected.
   */
  platforms: readonly Platform[];
};

export const BRANDS: readonly BrandMeta[] = [
  {
    id: "northlane",
    label: "Northlane",
    blurb: "Outdoor apparel — full-funnel across every channel",
    platforms: ["meta", "tiktok", "google_search", "linkedin"],
  },
  {
    id: "olive",
    label: "Olive",
    blurb: "Skincare DTC — Meta prospecting + Google intent",
    platforms: ["meta", "google_search"],
  },
  {
    id: "kite",
    label: "Kite",
    blurb: "Kids' toys — TikTok-led with Meta retargeting",
    platforms: ["tiktok", "meta", "linkedin"],
  },
] as const;

export const DEFAULT_BRAND: Brand = "northlane";

/** A public synthetic demo brand. */
export function isBrand(value: unknown): value is Brand {
  return value === "northlane" || value === "olive" || value === "kite";
}

/* ----------------------------- Live brands ------------------------------ */

/**
 * The owner's real account, served from live Meta data. Kept separate from the
 * demo brands above: it is never listed in `BRANDS`, never accepted by
 * `isBrand`, never shown on the public /demo, and the server only returns its
 * data to the verified owner (see admate.functions / auth/viewer.server).
 */
export type LiveBrand = "my_account";

/** Any brand the signed-in workspace can show: demo brands plus live brands. */
export type WorkspaceBrand = Brand | LiveBrand;

export type WorkspaceBrandMeta = Omit<BrandMeta, "id"> & {
  id: WorkspaceBrand;
  /** True for brands backed by live (non-synthetic) data. */
  live?: boolean;
};

export const LIVE_BRANDS: readonly WorkspaceBrandMeta[] = [
  {
    id: "my_account",
    label: "My Account",
    blurb: "Your connected Meta ad account (live, read-only)",
    platforms: ["meta"],
    live: true,
  },
] as const;

export function isLiveBrand(value: unknown): value is LiveBrand {
  return value === "my_account";
}

/** A demo brand or a live brand (the workspace URL may carry either). */
export function isWorkspaceBrand(value: unknown): value is WorkspaceBrand {
  return isBrand(value) || isLiveBrand(value);
}

export function brandMeta(brand: WorkspaceBrand): WorkspaceBrandMeta {
  return (
    BRANDS.find((b) => b.id === brand) ??
    LIVE_BRANDS.find((b) => b.id === brand) ??
    (BRANDS[0] as BrandMeta)
  );
}

/** Platforms a brand has connected (in display order). */
export function brandPlatforms(brand: WorkspaceBrand): readonly Platform[] {
  return brandMeta(brand).platforms;
}

/** Whether a brand has connected a given platform. */
export function brandHasPlatform(brand: WorkspaceBrand, platform: Platform): boolean {
  return brandMeta(brand).platforms.includes(platform);
}

/**
 * Clamp an arbitrary platform to one this brand actually has connected. Used to
 * keep platform switching *inside* the selected brand: if the incoming platform
 * isn't connected, fall back to the brand's first connected platform.
 */
export function resolveBrandPlatform(brand: WorkspaceBrand, platform: unknown): Platform {
  const connected = brandPlatforms(brand);
  if (isPlatform(platform) && connected.includes(platform)) return platform;
  return connected[0];
}
