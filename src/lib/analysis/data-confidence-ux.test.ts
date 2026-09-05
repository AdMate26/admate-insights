import { expect, test } from "bun:test";

import {
  computeTiming,
  dataConfidenceGuidanceFor,
  performanceLabelFor,
  runAnalysis,
} from "./engine";
import type { NormalizedDailyRow } from "../tiktok/contract";
import { DemoTikTokDataProvider } from "../tiktok/demo-provider";
import { loadNormalizedDailyRows } from "../tiktok/normalize";

/**
 * Regression tests for the data-confidence UX changes:
 *   - low_volume → "Early Data" (no score)
 *   - tracking_issue → "Check Data" (no score) + steps
 *   - low volume must NOT hide a stronger issue
 *   - campaign timing display (active / ending / ongoing / ended), display-only
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

function buildCampaign(
  id: string,
  cur: Day,
  prev: Day | null,
  timing?: { start?: string | null; end?: string | null },
): NormalizedDailyRow[] {
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
    campaignStartDate: timing?.start ?? null,
    campaignEndDate: timing?.end ?? null,
  });
  for (let o = 1; o <= 7; o++) rows.push(mk(o, cur));
  if (prev) for (let o = 8; o <= 14; o++) rows.push(mk(o, prev));
  return rows;
}

const analyzeOne = (rows: NormalizedDailyRow[]) => runAnalysis(rows, 7).findings[0];

// --- 1. LOW VOLUME → Early Data / no score ----------------------------------

test("low_volume → Early Data, no score, low-volume guidance", () => {
  const f = analyzeOne(
    buildCampaign(
      "low_volume",
      { spend: 20, impressions: 2000, clicks: 40, conversions: 1, revenue: 40, reach: 1500 },
      { spend: 20, impressions: 2000, clicks: 40, conversions: 1, revenue: 40, reach: 1500 },
    ),
  );
  expect(f.signal).toBe("low_volume");
  expect(f.performanceScore).toBeNull();
  expect(f.performanceRating).toBeNull();
  expect(f.performanceLabel).toBe("Early Data");
  expect(f.performanceLabel).not.toBe("Check Data");
  expect(f.guidance?.directionNote).toBe("No major issue detected yet.");
  expect(f.guidance?.action).toBe("Continue collecting results before making a major optimization.");
});

// --- 2. TRACKING ISSUE → Check Data / no score + steps ----------------------

test("tracking_issue → Check Data, no score, verify-tracking steps", () => {
  const f = analyzeOne(
    buildCampaign(
      "tracking_issue",
      { spend: 400, impressions: 10000, clicks: 300, conversions: 8, revenue: 320, reach: 7000 },
      { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 },
    ),
  );
  expect(f.signal).toBe("tracking_issue");
  expect(f.performanceScore).toBeNull();
  expect(f.performanceLabel).toBe("Check Data");
  expect(f.guidance?.action).toBe(
    "Verify conversion tracking before changing budget, targeting or creative.",
  );
  expect(f.guidance?.steps?.length).toBe(4);
  expect(f.guidance?.steps?.[0]).toContain("Compare TikTok conversions");
});

// --- 3. Low volume must NOT hide a stronger issue ---------------------------

test("low volume does not hide a SEVERE performance deterioration", () => {
  // Thin data (7 conversions/week) but CPA up ~70% (severe).
  const f = analyzeOne(
    buildCampaign(
      "thin_but_severe_cpa",
      { spend: 34, impressions: 2000, clicks: 40, conversions: 1, revenue: 40, reach: 1500 }, // cpa 34
      { spend: 20, impressions: 2000, clicks: 40, conversions: 1, revenue: 40, reach: 1500 }, // cpa 20
    ),
  );
  expect(f.signal).toBe("cpa_deterioration");
  expect(f.signal).not.toBe("low_volume");
  expect(f.performanceScore).not.toBeNull();
});

test("low volume does not hide a tracking problem", () => {
  // Thin current volume (7/week) but conversions collapsed while clicks held.
  const f = analyzeOne(
    buildCampaign(
      "thin_but_tracking",
      { spend: 400, impressions: 10000, clicks: 300, conversions: 1, revenue: 40, reach: 7000 },
      { spend: 400, impressions: 10000, clicks: 300, conversions: 5, revenue: 200, reach: 7000 },
    ),
  );
  expect(f.signal).toBe("tracking_issue");
  expect(f.signal).not.toBe("low_volume");
  expect(f.performanceLabel).toBe("Check Data");
});

test("low volume with only mild movement still reads as low volume", () => {
  const f = analyzeOne(
    buildCampaign(
      "thin_mild",
      { spend: 22, impressions: 2000, clicks: 40, conversions: 1, revenue: 40, reach: 1500 }, // cpa 22 (+10%)
      { spend: 20, impressions: 2000, clicks: 40, conversions: 1, revenue: 40, reach: 1500 }, // cpa 20
    ),
  );
  expect(f.signal).toBe("low_volume");
  expect(f.performanceLabel).toBe("Early Data");
});

// --- 4. Campaign timing display --------------------------------------------

const TODAY = "2026-09-05";

test("timing: active campaign with days left", () => {
  const t = computeTiming("2026-08-01", "2026-09-18", TODAY);
  expect(t.label).toBe("Ends Sep 18 · 13 days left");
  expect(t.daysRemaining).toBe(13);
});

test("timing: ending tomorrow / today", () => {
  expect(computeTiming("2026-08-01", "2026-09-06", TODAY).label).toBe("Ends Tomorrow");
  expect(computeTiming("2026-08-01", "2026-09-05", TODAY).label).toBe("Ends Today");
});

test("timing: ongoing (no end date)", () => {
  const t = computeTiming("2026-08-01", null, TODAY);
  expect(t.label).toBe("Ongoing · No end date");
  expect(t.daysRemaining).toBeNull();
});

test("timing: ended campaign", () => {
  const t = computeTiming("2026-07-01", "2026-09-02", TODAY);
  expect(t.label).toBe("Ended Sep 2");
  expect(t.daysRemaining).toBeLessThan(0);
});

test("timing: not started yet", () => {
  expect(computeTiming("2026-09-10", null, TODAY).label).toBe("Starts Sep 10");
});

test("timing is display-only — it never changes analysis", () => {
  const metrics: [Day, Day] = [
    { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 },
    { spend: 400, impressions: 10000, clicks: 300, conversions: 20, revenue: 800, reach: 7000 },
  ];
  const ongoing = analyzeOne(buildCampaign("t1", metrics[0], metrics[1], { start: "2026-01-01", end: null }));
  const ending = analyzeOne(buildCampaign("t1", metrics[0], metrics[1], { start: "2026-01-01", end: "2026-09-18" }));
  // Same numbers, different timing → identical analysis, different timing label.
  expect(ending.signal).toBe(ongoing.signal);
  expect(ending.performanceScore).toBe(ongoing.performanceScore);
  expect(ending.performanceRating).toBe(ongoing.performanceRating);
  expect(ending.confidence).toBe(ongoing.confidence);
  expect(ending.severity).toBe(ongoing.severity);
  expect(ending.severityScore).toBe(ongoing.severityScore);
  expect(ending.timing.label).not.toBe(ongoing.timing.label);
});

// --- 5. Pure helpers + demo smoke ------------------------------------------

test("performanceLabelFor and dataConfidenceGuidanceFor", () => {
  expect(performanceLabelFor("low_volume", null)).toBe("Early Data");
  expect(performanceLabelFor("tracking_issue", null)).toBe("Check Data");
  expect(performanceLabelFor("insufficient_comparison", null)).toBe("Check Data");
  expect(performanceLabelFor("stable", "Good")).toBe("Good");
  expect(dataConfidenceGuidanceFor("stable")).toBeNull();
  expect(dataConfidenceGuidanceFor("low_volume")?.directionNote).toBeTruthy();
  expect(dataConfidenceGuidanceFor("tracking_issue")?.steps?.length).toBe(4);
});

test("demo dataset: low volume reads Early Data, tracking reads Check Data, all carry timing", async () => {
  const rows = await loadNormalizedDailyRows(new DemoTikTokDataProvider(), 28);
  const { findings } = runAnalysis(rows, 7);
  const low = findings.find((f) => f.signal === "low_volume");
  const tracking = findings.find((f) => f.signal === "tracking_issue");
  expect(low?.performanceLabel).toBe("Early Data");
  expect(tracking?.performanceLabel).toBe("Check Data");
  for (const f of findings) {
    expect(typeof f.timing.label).toBe("string");
    expect(f.timing.label.length).toBeGreaterThan(0);
  }
});
