import { expect, test } from "bun:test";

import {
  analyzeCampaigns,
  type CampaignInput,
  type DailyMetric,
  type Performance,
} from "./engine";
import { getDemoCampaigns } from "./demo";
import type { Platform } from "../platforms";

const meta = analyzeCampaigns(getDemoCampaigns("meta"));
const tiktok = analyzeCampaigns(getDemoCampaigns("tiktok"));
const google = analyzeCampaigns(getDemoCampaigns("google_search"));
const byId = (r: typeof meta) => new Map(r.findings.map((f) => [f.campaignId, f]));
const M = byId(meta);
const T = byId(tiktok);
const G = byId(google);

const PERF: Performance[] = ["High", "Moderate", "Low", "In Review", "Error"];

/* -------- Meta scenario matrix -------- */
test("Meta: objective-aware verdicts + signals", () => {
  expect(M.get("m_sales_aplus")!.performance).toBe("High");
  expect(M.get("m_sales_aplus")!.signal).toBe("Healthy scaling");

  expect(M.get("m_sales_abo")!.performance).toBe("Low");
  expect(M.get("m_sales_abo")!.signal).toBe("Creative fatigue");

  expect(M.get("m_sales_retarget")!.performance).toBe("Low");
  expect(M.get("m_sales_retarget")!.signal).toBe("Post-click drop-off");

  expect(M.get("m_leads_wholesale")!.performance).toBe("Low");
  expect(M.get("m_leads_wholesale")!.signal).toBe("Lead-form drop-off");
  expect(M.get("m_leads_wholesale")!.primaryMetric).toBe("Cost per lead");

  expect(M.get("m_awareness_reach")!.signal).toBe("Auction pressure");
  expect(M.get("m_awareness_reach")!.primaryMetric).toBe("CPM");

  expect(M.get("m_sales_cbo_learn")!.performance).toBe("In Review");
  expect(M.get("m_sales_cbo_learn")!.signal).toBe("Learning phase");

  expect(M.get("m_sales_catalogue_track")!.performance).toBe("Error");

  expect(M.get("m_traffic_guide")!.performance).toBe("In Review");
  expect(M.get("m_traffic_guide")!.campaignState).toBe("insufficient_history");
  expect(M.get("m_traffic_guide")!.primaryMetric).toBe("Cost / landing-page view");
});

/* -------- TikTok scenario matrix -------- */
test("TikTok: objective-aware verdicts + signals", () => {
  expect(T.get("t_video_trend")!.performance).toBe("Low");
  expect(T.get("t_video_trend")!.signal).toBe("Weak hook");
  expect(T.get("t_video_trend")!.primaryMetric).toBe("Cost / view"); // NOT ROAS

  expect(T.get("t_sales_spark")!.performance).toBe("High");
  expect(T.get("t_sales_spark")!.primaryMetric).toBe("ROAS");

  expect(T.get("t_sales_smartplus_zero")!.performance).toBe("Low");
  expect(T.get("t_sales_smartplus_zero")!.signal).toBe("No conversions");

  expect(T.get("t_sales_quality")!.performance).toBe("Moderate");
  expect(T.get("t_sales_quality")!.signal).toBe("Traffic-quality drift");

  expect(T.get("t_sales_vsa_new")!.performance).toBe("In Review");
  expect(T.get("t_sales_vsa_new")!.signal).toBe("New campaign");

  expect(T.get("t_leads_form")!.performance).toBe("In Review");
  expect(T.get("t_leads_form")!.signal).toBe("Insufficient results");
});

/* -------- Google scenario matrix (campaign-type aware) -------- */
test("Google: campaign-type-aware verdicts + signals", () => {
  expect(G.get("g_search_nonbrand")!.performance).toBe("Low");
  expect(G.get("g_search_nonbrand")!.signal).toBe("Search-intent mismatch");

  expect(G.get("g_pmax_all")!.performance).toBe("Low");
  expect(G.get("g_pmax_all")!.campaignType).toBe("Performance Max");

  expect(G.get("g_shopping_learn")!.performance).toBe("In Review");
  expect(G.get("g_shopping_learn")!.signal).toBe("Learning phase");

  expect(G.get("g_search_brand")!.performance).toBe("High");

  expect(G.get("g_search_category")!.performance).toBe("In Review");
  expect(G.get("g_search_category")!.signal).toBe("Recently edited");

  // Missing optional metrics (no hook/completion) → graceful, judged on cost/view.
  const dg = G.get("g_demandgen_yt")!;
  expect(dg.primaryMetric).toBe("Cost / view");
  expect(PERF).toContain(dg.performance);
});

/* -------- Cross-cutting guarantees -------- */
test("performance is one of five verdicts and never a numeric score", () => {
  for (const r of [meta, tiktok, google]) {
    for (const f of r.findings) {
      expect(PERF).toContain(f.performance);
      expect(Object.prototype.hasOwnProperty.call(f, "performanceScore")).toBe(false);
    }
  }
});

test("upper-funnel objectives are never graded on ROAS/CPA", () => {
  const upper = [...meta.findings, ...tiktok.findings, ...google.findings].filter((f) =>
    ["awareness", "video", "traffic_clicks", "traffic_lpv"].includes(f.objectiveFamily),
  );
  expect(upper.length).toBeGreaterThan(0);
  for (const f of upper) {
    expect(["ROAS", "CPA"]).not.toContain(f.primaryMetric);
  }
});

test("findings are ordered by priority (most urgent first)", () => {
  for (const r of [meta, tiktok, google]) {
    for (let i = 1; i < r.findings.length; i++) {
      expect(r.findings[i - 1].priority).toBeGreaterThanOrEqual(r.findings[i].priority - 1e-9);
    }
  }
});

test("budget-at-risk only for lower-funnel with a comparison; upper-funnel uses spend exposure", () => {
  expect(M.get("m_sales_retarget")!.exposure.kind).toBe("budget_at_risk");
  // Awareness (upper funnel) never shows fabricated $ waste.
  expect(M.get("m_awareness_reach")!.exposure.kind).toBe("spend_exposure");
});

/* -------- Reference-layout support (objective-specific tables) -------- */
test("supporting columns differ by objective (objective-specific tables)", () => {
  const cols = (id: string, r: typeof meta) =>
    r.findings.find((f) => f.campaignId === id)!.supportingColumns.map((c) => c.label);
  expect(cols("m_sales_aplus", meta)).toEqual(["Purchases", "ROAS", "CPA"]);
  expect(cols("m_leads_wholesale", meta)).toEqual(["Leads", "CPL", "Click→lead"]);
  expect(cols("m_awareness_reach", meta)).toEqual(["Reach", "CPM", "Frequency"]);
  expect(cols("m_traffic_guide", meta)).toEqual(["LPVs", "Cost/LPV", "LPV rate"]);
  expect(cols("t_video_trend", tiktok)).toEqual([
    "Focused views",
    "Cost / focused view",
    "Focused view rate",
  ]);
});

test("every finding carries a trend series and an objective explanation", () => {
  for (const r of [meta, tiktok, google]) {
    for (const f of r.findings) {
      expect(Array.isArray(f.trend)).toBe(true);
      expect(typeof f.objectiveExplanation).toBe("string");
      expect(f.objectiveExplanation.length).toBeGreaterThan(10);
      expect(f.supportingColumns.length).toBe(3);
    }
  }
});

/* -------- Synthetic edge cases -------- */
function days(n: number, per: Partial<DailyMetric>): DailyMetric[] {
  const out: DailyMetric[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({
      date: d.toISOString().slice(0, 10),
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      ...per,
    });
  }
  return out;
}
function campaign(over: Partial<CampaignInput>): CampaignInput {
  return {
    campaignId: "x",
    campaignName: "X",
    platform: "meta" as Platform,
    objective: "Sales",
    conversionGoal: "Purchase",
    target: { type: "tROAS", value: 3 },
    days: [],
    ...over,
  };
}

test("explicit measurement failure → Error", () => {
  const c = campaign({
    tracking: { measurementError: true },
    days: days(14, { spend: 200, impressions: 10000, clicks: 300, conversions: 15, revenue: 900 }),
  });
  expect(analyzeCampaigns([c]).findings[0].performance).toBe("Error");
});

test("zero conversions with enough valid traffic → Low", () => {
  const c = campaign({
    campaignId: "z1",
    days: days(14, { spend: 250, impressions: 20000, clicks: 600, conversions: 0, revenue: 0 }),
    tracking: { conversionTrackingActive: true },
  });
  const f = analyzeCampaigns([c]).findings[0];
  expect(f.performance).toBe("Low");
  expect(f.signal).toBe("No conversions");
});

test("zero conversions with too little evidence → In Review", () => {
  const c = campaign({
    campaignId: "z2",
    days: days(14, { spend: 20, impressions: 1500, clicks: 40, conversions: 0, revenue: 0 }),
    tracking: { conversionTrackingActive: true },
  });
  expect(analyzeCampaigns([c]).findings[0].performance).toBe("In Review");
});

test("missing optional metrics never crash and still yield a verdict", () => {
  const c = campaign({
    campaignId: "v1",
    objective: "Video views",
    optimizationGoal: "Views",
    target: null,
    days: days(14, { spend: 100, impressions: 40000, clicks: 240, videoViews: 9000 }),
  });
  const f = analyzeCampaigns([c]).findings[0];
  expect(f.objectiveFamily).toBe("video");
  expect(PERF).toContain(f.performance);
});
