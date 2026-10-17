import { expect, test } from "bun:test";

import { analyzeCampaigns } from "../analysis/engine";
import {
  accountStatusLabel,
  addDays,
  analysisWindow,
  localToday,
  mapMetaCampaigns,
} from "./mapping";

const window = { since: "2026-10-03", until: "2026-10-16" };

test("window helpers: account-local today and 14 complete days", () => {
  expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  expect(analysisWindow("2026-10-17", 14)).toEqual(window);
  // 2026-10-16T20:00Z is already the 17th in Bangkok (+7).
  const now = new Date("2026-10-16T20:00:00Z");
  expect(localToday("Asia/Bangkok", now)).toBe("2026-10-17");
  expect(localToday("America/Los_Angeles", now)).toBe("2026-10-16");
  expect(localToday("Not/AZone", now)).toBe("2026-10-16"); // invalid → UTC
  expect(localToday(null, now)).toBe("2026-10-16");
});

test("account status codes map to readable labels", () => {
  expect(accountStatusLabel(1)).toBe("Active");
  expect(accountStatusLabel(2)).toBe("Disabled");
  expect(accountStatusLabel(undefined)).toBe("Unknown");
});

test("zero campaigns → zero CampaignInputs (no fake data)", () => {
  expect(
    mapMetaCampaigns({ campaigns: [], adsets: [], insights: [], window, idPrefix: "my_account__" }),
  ).toEqual([]);
});

test("campaigns without delivery in the window are not invented into data", () => {
  const out = mapMetaCampaigns({
    campaigns: [{ id: "1", name: "Never ran", objective: "OUTCOME_SALES" }],
    adsets: [],
    insights: [],
    window,
    idPrefix: "my_account__",
  });
  expect(out).toEqual([]);
});

test("sales campaign maps objective, goal, conversions, revenue and a dense daily series", () => {
  const out = mapMetaCampaigns({
    campaigns: [
      {
        id: "120",
        name: "Spring sale",
        objective: "OUTCOME_SALES",
        effective_status: "ACTIVE",
        start_time: "2026-10-10T09:00:00+0700",
        bid_strategy: "LOWEST_COST_WITH_MIN_ROAS",
      },
    ],
    adsets: [
      {
        id: "a1",
        campaign_id: "120",
        effective_status: "ACTIVE",
        optimization_goal: "VALUE",
        promoted_object: { custom_event_type: "PURCHASE" },
        bid_constraints: { roas_average_floor: 25000 },
        learning_stage_info: { status: "LEARNING" },
      },
    ],
    insights: [
      {
        campaign_id: "120",
        date_start: "2026-10-12",
        spend: "50.25",
        impressions: "4000",
        reach: "3000",
        inline_link_clicks: "80",
        actions: [
          { action_type: "omni_purchase", value: "3" },
          { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
          { action_type: "landing_page_view", value: "60" },
        ],
        action_values: [{ action_type: "omni_purchase", value: "210.5" }],
      },
      // Outside the window → ignored.
      { campaign_id: "120", date_start: "2026-10-17", spend: "999" },
    ],
    window,
    idPrefix: "my_account__",
  });

  expect(out).toHaveLength(1);
  const c = out[0]!;
  expect(c.campaignId).toBe("my_account__120");
  expect(c.platform).toBe("meta");
  expect(c.objective).toBe("Sales");
  expect(c.optimizationGoal).toBe("Conversions — Purchase (value)");
  expect(c.conversionGoal).toBe("Purchase");
  expect(c.bidStrategy).toBe("Target ROAS (minimum ROAS)");
  expect(c.target).toEqual({ type: "tROAS", value: 2.5 });
  expect(c.learningStatus).toBe("learning");
  expect(c.startDate).toBe("2026-10-10");
  // Dense from the start date (inside the window) to the window end.
  expect(c.days.map((d) => d.date)).toEqual([
    "2026-10-10",
    "2026-10-11",
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
  ]);
  const day = c.days.find((d) => d.date === "2026-10-12")!;
  expect(day.spend).toBeCloseTo(50.25);
  expect(day.clicks).toBe(80);
  expect(day.conversions).toBe(3); // first matching type only — no double counting
  expect(day.revenue).toBeCloseTo(210.5);
  expect(day.landingPageViews).toBe(60);
  expect(c.days.find((d) => d.date === "2026-10-11")!.spend).toBe(0);
});

test("ThruPlay-optimised awareness campaign is graded as video; engagement uses engagements as clicks", () => {
  const out = mapMetaCampaigns({
    campaigns: [
      { id: "v", name: "Video", objective: "OUTCOME_AWARENESS" },
      { id: "e", name: "Engage", objective: "OUTCOME_ENGAGEMENT" },
    ],
    adsets: [
      { id: "a", campaign_id: "v", optimization_goal: "THRUPLAY" },
      { id: "b", campaign_id: "e", optimization_goal: "POST_ENGAGEMENT" },
    ],
    insights: [
      {
        campaign_id: "v",
        date_start: "2026-10-15",
        spend: "10",
        impressions: "1000",
        video_thruplay_watched_actions: [{ action_type: "video_view", value: "120" }],
      },
      {
        campaign_id: "e",
        date_start: "2026-10-15",
        spend: "10",
        inline_link_clicks: "5",
        actions: [{ action_type: "post_engagement", value: "40" }],
      },
    ],
    window,
    idPrefix: "p__",
  });
  const video = out.find((c) => c.campaignId === "p__v")!;
  expect(video.objective).toBe("Video views");
  expect(video.days.at(-2)!.videoViews).toBe(120);
  const engage = out.find((c) => c.campaignId === "p__e")!;
  expect(engage.objective).toBe("Engagement");
  expect(engage.days.at(-2)!.clicks).toBe(40);
});

test("mapped campaigns run through the unchanged engine", () => {
  const out = mapMetaCampaigns({
    campaigns: [
      {
        id: "1",
        name: "Leads",
        objective: "OUTCOME_LEADS",
        start_time: "2026-09-01T00:00:00+0000",
      },
    ],
    adsets: [{ id: "a", campaign_id: "1", optimization_goal: "LEAD_GENERATION" }],
    insights: Array.from({ length: 14 }, (_, i) => ({
      campaign_id: "1",
      date_start: addDays(window.since, i),
      spend: "20",
      impressions: "2000",
      inline_link_clicks: "40",
      actions: [{ action_type: "lead", value: "4" }],
    })),
    window,
    idPrefix: "my_account__",
  });
  expect(out[0]?.days).toHaveLength(14);
  const result = analyzeCampaigns(out, "2026-10-17");
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]?.objectiveFamily).toBe("leads");
  expect(result.currentWindow).toEqual({ start: "2026-10-10", end: "2026-10-16" });
});
