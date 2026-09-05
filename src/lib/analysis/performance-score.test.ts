import { expect, test } from "bun:test";

import { NO_SCORE_SIGNALS, performanceRatingFor, runAnalysis, type Signal } from "./engine";
import type { NormalizedDailyRow } from "../tiktok/contract";
import { DemoTikTokDataProvider } from "../tiktok/demo-provider";
import { loadNormalizedDailyRows } from "../tiktok/normalize";

/**
 * Regression tests for the deterministic Performance Score. Each scenario forces
 * one signal through the FULL pipeline (runAnalysis) using synthetic daily rows,
 * then asserts the resulting score/rating band. Scenarios are built so the signal
 * cascade lands on the intended signal.
 */

function dateNAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type Day = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  reach: number;
};

/** 7 current-window days (offset 1..7) and optionally 7 previous-window days (8..14). */
function buildCampaign(id: string, cur: Day, prev: Day | null): NormalizedDailyRow[] {
  const rows: NormalizedDailyRow[] = [];
  const mk = (offset: number, d: Day): NormalizedDailyRow => ({
    date: dateNAgo(offset),
    campaignId: id,
    campaignName: id,
    adsetId: `${id}_ag`,
    adsetName: "ag",
    adId: `${id}_ad`,
    adName: "ad",
    spend: d.spend,
    impressions: d.impressions,
    clicks: d.clicks,
    conversions: d.conversions,
    revenue: d.revenue,
    reach: d.reach,
    dailyBudget: 1000,
  });
  for (let o = 1; o <= 7; o++) rows.push(mk(o, cur));
  if (prev) for (let o = 8; o <= 14; o++) rows.push(mk(o, prev));
  return rows;
}

function analyzeOne(rows: NormalizedDailyRow[]) {
  return runAnalysis(rows, 7).findings[0];
}

// --- scenario fixtures -------------------------------------------------------

const strongImprovement = buildCampaign(
  "strong_improvement",
  { spend: 300, impressions: 10000, clicks: 300, conversions: 30, revenue: 900, reach: 7000 }, // cpa 10
  { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 }, // cpa 20
);

const stable = buildCampaign(
  "stable",
  { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 },
  { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 },
);

const mildDeterioration = buildCampaign(
  "mild_cpa",
  { spend: 500, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 }, // cpa 25 (+25%)
  { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 }, // cpa 20
);

const severeDeterioration = buildCampaign(
  "severe_cpa",
  { spend: 640, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 }, // cpa 32 (+60%)
  { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 }, // cpa 20
);

const creativeFatigue = buildCampaign(
  "creative_fatigue",
  { spend: 264, impressions: 10000, clicks: 225, conversions: 11, revenue: 264, reach: 5800 }, // ctr 2.25%, freq 1.72, cpa 24
  { spend: 300, impressions: 10000, clicks: 300, conversions: 15, revenue: 600, reach: 7000 }, // ctr 3%, freq 1.43, cpa 20
);

const trackingIssue = buildCampaign(
  "tracking_issue",
  { spend: 400, impressions: 10000, clicks: 300, conversions: 8, revenue: 320, reach: 7000 }, // clicks flat, conv -60%
  { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 },
);

const lowVolume = buildCampaign(
  "low_volume",
  { spend: 30, impressions: 2000, clicks: 50, conversions: 1, revenue: 40, reach: 1500 }, // 7 conv/week < 10
  { spend: 30, impressions: 2000, clicks: 50, conversions: 1, revenue: 40, reach: 1500 },
);

const insufficientComparison = buildCampaign(
  "insufficient_comparison",
  { spend: 300, impressions: 10000, clicks: 300, conversions: 30, revenue: 900, reach: 7000 },
  null, // no prior window
);

// --- tests -------------------------------------------------------------------

test("strong improvement → Very Good (highest band)", () => {
  const f = analyzeOne(strongImprovement);
  expect(f.signal).toBe("strong_improvement");
  expect(f.performanceScore).not.toBeNull();
  expect(f.performanceScore!).toBeGreaterThanOrEqual(85);
  expect(f.performanceRating).toBe("Very Good");
});

test("stable → Good", () => {
  const f = analyzeOne(stable);
  expect(f.signal).toBe("stable");
  expect(f.performanceRating).toBe("Good");
  expect(f.performanceScore!).toBeGreaterThanOrEqual(70);
  expect(f.performanceScore!).toBeLessThanOrEqual(84);
});

test("mild deterioration → Fair", () => {
  const f = analyzeOne(mildDeterioration);
  expect(f.signal).toBe("cpa_deterioration");
  expect(f.performanceRating).toBe("Fair");
  expect(f.performanceScore!).toBeGreaterThanOrEqual(50);
  expect(f.performanceScore!).toBeLessThanOrEqual(69);
});

test("severe deterioration → Needs Attention", () => {
  const f = analyzeOne(severeDeterioration);
  expect(f.signal).toBe("cpa_deterioration");
  expect(f.performanceRating).toBe("Needs Attention");
  expect(f.performanceScore!).toBeLessThan(50);
});

test("creative fatigue → Needs Attention", () => {
  const f = analyzeOne(creativeFatigue);
  expect(f.signal).toBe("creative_fatigue");
  expect(f.performanceRating).toBe("Needs Attention");
  expect(f.performanceScore!).toBeLessThan(50);
});

test("tracking issue → no score (Check Data)", () => {
  const f = analyzeOne(trackingIssue);
  expect(f.signal).toBe("tracking_issue");
  expect(f.performanceScore).toBeNull();
  expect(f.performanceRating).toBeNull();
});

test("low volume → no score (Check Data)", () => {
  const f = analyzeOne(lowVolume);
  expect(f.signal).toBe("low_volume");
  expect(f.performanceScore).toBeNull();
  expect(f.performanceRating).toBeNull();
});

test("insufficient comparison → no score (Check Data)", () => {
  const f = analyzeOne(insufficientComparison);
  expect(f.signal).toBe("insufficient_comparison");
  expect(f.performanceScore).toBeNull();
  expect(f.performanceRating).toBeNull();
});

test("spend does not change the score (priority only)", () => {
  const lowSpend = analyzeOne(mildDeterioration);
  // Same percentage moves, 10x the absolute spend/volume.
  const highSpend = analyzeOne(
    buildCampaign(
      "mild_cpa_big",
      { spend: 5000, impressions: 100000, clicks: 3000, conversions: 200, revenue: 8000, reach: 70000 },
      { spend: 4000, impressions: 100000, clicks: 3000, conversions: 200, revenue: 8000, reach: 70000 },
    ),
  );
  expect(highSpend.signal).toBe("cpa_deterioration");
  expect(highSpend.performanceScore).toBe(lowSpend.performanceScore);
});

test("rating bands map correctly at boundaries", () => {
  expect(performanceRatingFor(100)).toBe("Very Good");
  expect(performanceRatingFor(85)).toBe("Very Good");
  expect(performanceRatingFor(84)).toBe("Good");
  expect(performanceRatingFor(70)).toBe("Good");
  expect(performanceRatingFor(69)).toBe("Fair");
  expect(performanceRatingFor(50)).toBe("Fair");
  expect(performanceRatingFor(49)).toBe("Needs Attention");
  expect(performanceRatingFor(0)).toBe("Needs Attention");
});

test("demo dataset: score present iff signal is scoreable, and matches its band", async () => {
  const rows = await loadNormalizedDailyRows(new DemoTikTokDataProvider(), 28);
  const { findings } = runAnalysis(rows, 7);
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    const noScore = NO_SCORE_SIGNALS.has(f.signal as Signal);
    if (noScore) {
      expect(f.performanceScore).toBeNull();
      expect(f.performanceRating).toBeNull();
    } else {
      expect(f.performanceScore).not.toBeNull();
      expect(f.performanceScore!).toBeGreaterThanOrEqual(0);
      expect(f.performanceScore!).toBeLessThanOrEqual(100);
      expect(f.performanceRating).toBe(performanceRatingFor(f.performanceScore!));
    }
  }
});
