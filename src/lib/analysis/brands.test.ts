import { expect, test } from "bun:test";

import { analyzeCampaigns, type CampaignFinding } from "./engine";
import { getDemoCampaigns, getDemoCampaignsForBrand } from "./demo";
import {
  BRANDS,
  brandHasPlatform,
  brandPlatforms,
  resolveBrandPlatform,
  type Brand,
} from "../brands";
import { needsAttentionCount } from "../attention";
import { PLATFORMS, type Platform } from "../platforms";

const BRAND_IDS = BRANDS.map((b) => b.id);

function analyze(brand: Brand, platform: Platform): CampaignFinding[] {
  return analyzeCampaigns(getDemoCampaignsForBrand(brand, platform)).findings;
}

/* -------- Brand → connected platforms is the organisational layer -------- */
test("each brand connects exactly the specified platforms", () => {
  expect(brandPlatforms("northlane")).toEqual(["meta", "tiktok", "google_search"]);
  expect(brandPlatforms("olive")).toEqual(["meta", "google_search"]);
  expect(brandPlatforms("kite")).toEqual(["tiktok", "meta"]);

  // A brand is never graded on a platform it has not connected.
  expect(brandHasPlatform("olive", "tiktok")).toBe(false);
  expect(brandHasPlatform("kite", "google_search")).toBe(false);
  expect(getDemoCampaignsForBrand("olive", "tiktok")).toEqual([]);
  expect(getDemoCampaignsForBrand("kite", "google_search")).toEqual([]);
});

/* -------- Brand switching shows only that brand's accounts/campaigns ------ */
test("brand switching shows only that brand's campaigns (namespaced, no overlap)", () => {
  const ids = new Map<Brand, Set<string>>();
  for (const b of BRAND_IDS) {
    const all = brandPlatforms(b).flatMap((p) => getDemoCampaignsForBrand(b, p));
    // Every campaign id is namespaced by its brand…
    for (const c of all) expect(c.campaignId.startsWith(`${b}__`)).toBe(true);
    ids.set(b, new Set(all.map((c) => c.campaignId)));
  }
  // …so no campaign id is ever shared between two brands.
  for (const a of BRAND_IDS) {
    for (const b of BRAND_IDS) {
      if (a === b) continue;
      const overlap = [...ids.get(a)!].filter((id) => ids.get(b)!.has(id));
      expect(overlap).toEqual([]);
    }
  }
});

/* -------- Platform switching stays within the selected brand ------------- */
test("platform selection is always clamped to the brand's connected platforms", () => {
  for (const b of BRAND_IDS) {
    const connected = brandPlatforms(b);
    // Any platform not connected falls back to the brand's first platform.
    for (const p of PLATFORMS.map((x) => x.id)) {
      const resolved = resolveBrandPlatform(b, p);
      expect(connected).toContain(resolved);
      if (connected.includes(p)) expect(resolved).toBe(p);
    }
    // Junk input also resolves to a connected platform.
    expect(connected).toContain(resolveBrandPlatform(b, "not-a-platform"));
    expect(resolveBrandPlatform(b, undefined)).toBe(connected[0]);
  }
});

/* -------- Needs-attention counts are correct and brand-scoped ------------ */
test("needs-attention counts are correct per brand + platform", () => {
  // Deterministic synthetic data → fixed, verifiable counts. "Needs attention"
  // is exactly Performance === "Low" (single source of truth in attention.ts).
  const expected: Record<Brand, Partial<Record<Platform, { total: number; low: number }>>> = {
    northlane: {
      meta: { total: 8, low: 4 },
      tiktok: { total: 7, low: 2 },
      google_search: { total: 6, low: 2 },
    },
    olive: {
      meta: { total: 5, low: 3 },
      google_search: { total: 4, low: 1 },
    },
    kite: {
      tiktok: { total: 5, low: 2 },
      meta: { total: 4, low: 2 },
    },
  };

  for (const b of BRAND_IDS) {
    for (const p of brandPlatforms(b)) {
      const findings = analyze(b, p);
      const exp = expected[b][p]!;
      expect(findings.length).toBe(exp.total);
      // The helper and a raw Low filter must agree — one definition only.
      expect(needsAttentionCount(findings)).toBe(exp.low);
      expect(findings.filter((f) => f.performance === "Low").length).toBe(exp.low);
    }
  }
});

/* -------- Platform analyzers never mix across a brand -------------------- */
test("within a brand, each platform is analysed only by its own rules", () => {
  for (const b of BRAND_IDS) {
    for (const p of brandPlatforms(b)) {
      const findings = analyze(b, p);
      // Every finding belongs to the platform it was analysed under.
      for (const f of findings) expect(f.platform).toBe(p);
    }
  }
});

test("the same campaign structure is graded identically regardless of brand", () => {
  // A brand is only an organisational wrapper: the platform-specific analyzer
  // reaches the same verdict/KPI/signal for a given structure in any brand.
  const cases: { src: string; platform: Platform; brands: Brand[] }[] = [
    { src: "m_sales_aplus", platform: "meta", brands: ["northlane", "olive", "kite"] },
    { src: "t_video_trend", platform: "tiktok", brands: ["northlane", "kite"] },
    { src: "g_search_nonbrand", platform: "google_search", brands: ["northlane", "olive"] },
  ];
  for (const { src, platform, brands } of cases) {
    const graded = brands.map((b) => {
      const f = analyze(b, platform).find((x) => x.campaignId === `${b}__${src}`);
      expect(f).toBeDefined();
      return f!;
    });
    const first = graded[0];
    for (const f of graded) {
      expect(f.platform).toBe(platform);
      expect(f.performance).toBe(first.performance);
      expect(f.primaryMetric).toBe(first.primaryMetric);
      expect(f.signal).toBe(first.signal);
      expect(f.objectiveFamily).toBe(first.objectiveFamily);
    }
  }
});

/* -------- Backward compatibility: the platform pool is untouched --------- */
test("platform-level pool is unchanged (engine regression suite still valid)", () => {
  // The brand layer must not have altered the platform-agnostic demo pool.
  expect(getDemoCampaigns("meta").map((c) => c.campaignId)).toEqual([
    "m_sales_aplus",
    "m_sales_abo",
    "m_sales_retarget",
    "m_leads_wholesale",
    "m_awareness_reach",
    "m_sales_cbo_learn",
    "m_sales_catalogue_track",
    "m_traffic_guide",
  ]);
  expect(getDemoCampaigns("tiktok").length).toBe(7);
  expect(getDemoCampaigns("google_search").length).toBe(6);
});
