/**
 * Platform registry (display metadata only — client-safe).
 *
 * This module holds NO providers or analyzers so it can be imported by the
 * header/UI without pulling server-only demo-data code into the client bundle.
 * The server side (admate.functions) maps each platform id to its own demo
 * provider and its own analyzer.
 */

export type Platform = "tiktok" | "meta" | "google_search" | "linkedin";

export type PlatformMeta = {
  id: Platform;
  /** Dropdown / header label. */
  label: string;
  /** Mode line shown in the header. */
  modeLabel: string;
};

export const PLATFORMS: readonly PlatformMeta[] = [
  {
    id: "tiktok",
    label: "TikTok Ads",
    modeLabel: "Demo Mode — Synthetic TikTok Ads Data",
  },
  {
    id: "meta",
    label: "Meta Ads",
    modeLabel: "Demo Mode — Synthetic Meta Ads Data",
  },
  {
    id: "google_search",
    label: "Google Ads — Search",
    modeLabel: "Demo Mode — Synthetic Google Search Ads Data",
  },
  {
    id: "linkedin",
    label: "LinkedIn Ads",
    modeLabel: "Demo Mode — Synthetic LinkedIn Ads Data",
  },
] as const;

export const DEFAULT_PLATFORM: Platform = "tiktok";

export function isPlatform(value: unknown): value is Platform {
  return (
    value === "tiktok" || value === "meta" || value === "google_search" || value === "linkedin"
  );
}

export function platformMeta(platform: Platform): PlatformMeta {
  return PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0];
}
