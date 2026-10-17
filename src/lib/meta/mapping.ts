/**
 * Pure mapping from Meta Marketing API responses to AdMate's existing
 * `CampaignInput` shape. No network, no secrets, no engine changes: the
 * objective-aware engine grades the result exactly as it grades demo data.
 *
 * Two engine expectations shape this module:
 * - The engine reads the last 7 and previous 7 *rows*, so each campaign gets a
 *   dense daily series (zero rows for days without delivery) inside the window,
 *   never before the campaign started.
 * - The engine excludes "today" by date, so callers pass the account-local
 *   today alongside the campaigns.
 */

import type { CampaignInput, CampaignTarget, DailyMetric } from "../analysis/engine";

/* ------------------------------ Meta shapes ------------------------------ */

export type MetaAccount = {
  account_id?: string;
  id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
};

export type MetaCampaign = {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  start_time?: string;
  stop_time?: string;
  bid_strategy?: string;
};

export type MetaAdSet = {
  id: string;
  campaign_id: string;
  effective_status?: string;
  optimization_goal?: string;
  bid_strategy?: string;
  bid_constraints?: { roas_average_floor?: number | string };
  promoted_object?: { custom_event_type?: string };
  learning_stage_info?: { status?: string };
};

type MetaAction = { action_type?: string; value?: string | number };

export type MetaInsightRow = {
  campaign_id?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
  video_continuous_2_sec_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
};

/* ------------------------------- Labels ---------------------------------- */

const ACCOUNT_STATUS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending risk review",
  8: "Pending settlement",
  9: "In grace period",
  100: "Pending closure",
  101: "Closed",
  201: "Active",
  202: "Closed",
};

export function accountStatusLabel(status: number | undefined): string {
  return status !== undefined && ACCOUNT_STATUS[status] ? ACCOUNT_STATUS[status] : "Unknown";
}

/** Meta objective → the human objective label the engine's normaliser reads. */
const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_SALES: "Sales",
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_APP_PROMOTION: "App promotion",
  // Legacy (pre-ODAX) objectives.
  CONVERSIONS: "Sales",
  PRODUCT_CATALOG_SALES: "Sales",
  LINK_CLICKS: "Traffic",
  LEAD_GENERATION: "Leads",
  REACH: "Awareness",
  BRAND_AWARENESS: "Awareness",
  VIDEO_VIEWS: "Video views",
  POST_ENGAGEMENT: "Engagement",
  PAGE_LIKES: "Engagement",
  MESSAGES: "Engagement",
  EVENT_RESPONSES: "Engagement",
  APP_INSTALLS: "App promotion",
};

const OPTIMIZATION_LABEL: Record<string, string> = {
  OFFSITE_CONVERSIONS: "Conversions",
  VALUE: "Conversions (value)",
  LANDING_PAGE_VIEWS: "Landing page views",
  LINK_CLICKS: "Link clicks",
  IMPRESSIONS: "Impressions",
  REACH: "Reach",
  THRUPLAY: "ThruPlay video views",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "2-second video views",
  LEAD_GENERATION: "Leads — Instant form",
  QUALITY_LEAD: "Quality leads",
  POST_ENGAGEMENT: "Post engagement",
  APP_INSTALLS: "App installs",
  CONVERSATIONS: "Conversations",
};

const VIDEO_GOALS = new Set(["THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", "VIDEO_VIEWS"]);

const CONVERSION_EVENT_LABEL: Record<string, string> = {
  PURCHASE: "Purchase",
  LEAD: "Lead",
  COMPLETE_REGISTRATION: "Complete registration",
  ADD_TO_CART: "Add to cart",
  INITIATED_CHECKOUT: "Initiate checkout",
  CONTACT: "Contact",
};

const BID_STRATEGY_LABEL: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "Highest volume",
  LOWEST_COST_WITH_BID_CAP: "Bid cap",
  COST_CAP: "Cost cap",
  LOWEST_COST_WITH_MIN_ROAS: "Target ROAS (minimum ROAS)",
};

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ------------------------------ Helpers ---------------------------------- */

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Value of the first action type present (avoids double-counting overlaps). */
function firstAction(actions: MetaAction[] | undefined, types: readonly string[]): number {
  if (!actions?.length) return 0;
  for (const type of types) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return num(hit.value);
  }
  return 0;
}

function sumActions(actions: MetaAction[] | undefined): number {
  return (actions ?? []).reduce((total, a) => total + num(a.value), 0);
}

/** Account-local calendar date of a Meta timestamp ("2026-09-01T10:00:00+0700"). */
function datePart(ts: string | undefined): string | null {
  return ts && /^\d{4}-\d{2}-\d{2}/.test(ts) ? ts.slice(0, 10) : null;
}

export function addDays(isoDate: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date in the account's timezone (falls back to UTC). */
export function localToday(timezone: string | null | undefined, now: Date = new Date()): string {
  if (timezone) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      /* invalid timezone → UTC */
    }
  }
  return now.toISOString().slice(0, 10);
}

/** The analysis window: the last `days` complete account-local days. */
export function analysisWindow(todayIso: string, days = 14): { since: string; until: string } {
  return { since: addDays(todayIso, -days), until: addDays(todayIso, -1) };
}

/** Prefer an active ad set; otherwise the first one Meta returned. */
function representativeAdSet(adsets: MetaAdSet[]): MetaAdSet | undefined {
  return adsets.find((a) => a.effective_status === "ACTIVE") ?? adsets[0];
}

/* ------------------------------- Mapping --------------------------------- */

type ConversionTypes = { conversions: readonly string[]; revenue: readonly string[] };

function conversionTypes(
  conversionGoal: string | undefined,
  objectiveLabel: string,
): ConversionTypes {
  const purchase = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
  const lead = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
  switch (conversionGoal) {
    case "Purchase":
      return { conversions: purchase, revenue: purchase };
    case "Lead":
      return { conversions: lead, revenue: [] };
    case "Complete registration":
      return { conversions: ["omni_complete_registration"], revenue: [] };
    case "Add to cart":
      return { conversions: ["omni_add_to_cart"], revenue: [] };
    case "Initiate checkout":
      return { conversions: ["omni_initiated_checkout"], revenue: [] };
    case "Install":
      return { conversions: ["omni_app_install", "mobile_app_install"], revenue: [] };
    default:
      if (objectiveLabel === "Sales") return { conversions: purchase, revenue: purchase };
      if (objectiveLabel === "Leads") return { conversions: lead, revenue: [] };
      return { conversions: [], revenue: [] };
  }
}

function toDailyMetric(
  row: MetaInsightRow,
  types: ConversionTypes,
  engagement: boolean,
): DailyMetric {
  return {
    date: row.date_start ?? "",
    spend: num(row.spend),
    impressions: num(row.impressions),
    // Link clicks drive CTR / CPC / CVR. For engagement campaigns the KPI is
    // "cost per engagement", so engagements stand in for clicks.
    clicks: engagement
      ? firstAction(row.actions, ["post_engagement"])
      : num(row.inline_link_clicks),
    conversions: firstAction(row.actions, types.conversions),
    revenue: firstAction(row.action_values, types.revenue),
    reach: num(row.reach),
    landingPageViews: firstAction(row.actions, ["landing_page_view", "omni_landing_page_view"]),
    leads: firstAction(row.actions, ["lead", "onsite_conversion.lead_grouped"]),
    installs: firstAction(row.actions, ["omni_app_install", "mobile_app_install"]),
    videoViews: sumActions(row.video_thruplay_watched_actions),
    videoWatched2s: sumActions(row.video_continuous_2_sec_watched_actions),
    videoP100: sumActions(row.video_p100_watched_actions),
  };
}

function emptyDay(date: string): DailyMetric {
  return {
    date,
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    reach: 0,
    landingPageViews: 0,
    leads: 0,
    installs: 0,
    videoViews: 0,
    videoWatched2s: 0,
    videoP100: 0,
  };
}

export type MetaMappingInput = {
  campaigns: MetaCampaign[];
  adsets: MetaAdSet[];
  insights: MetaInsightRow[];
  window: { since: string; until: string };
  /** Prefix for AdMate campaign ids, e.g. "my_account__". */
  idPrefix: string;
};

/**
 * Map Meta campaigns + ad sets + daily campaign insights to `CampaignInput[]`.
 * Only campaigns with delivery inside the window are returned; a campaign that
 * never ran has nothing for the engine to judge (and no fake data is created).
 */
export function mapMetaCampaigns(input: MetaMappingInput): CampaignInput[] {
  const { since, until } = input.window;

  const adsetsByCampaign = new Map<string, MetaAdSet[]>();
  for (const adset of input.adsets) {
    const list = adsetsByCampaign.get(adset.campaign_id) ?? [];
    list.push(adset);
    adsetsByCampaign.set(adset.campaign_id, list);
  }

  const rowsByCampaign = new Map<string, Map<string, MetaInsightRow>>();
  for (const row of input.insights) {
    if (!row.campaign_id || !row.date_start) continue;
    if (row.date_start < since || row.date_start > until) continue;
    const byDate = rowsByCampaign.get(row.campaign_id) ?? new Map<string, MetaInsightRow>();
    byDate.set(row.date_start, row);
    rowsByCampaign.set(row.campaign_id, byDate);
  }

  const result: CampaignInput[] = [];
  for (const campaign of input.campaigns) {
    const rows = rowsByCampaign.get(campaign.id);
    if (!rows || rows.size === 0) continue;

    const adset = representativeAdSet(adsetsByCampaign.get(campaign.id) ?? []);
    const goal = adset?.optimization_goal;
    let objective =
      OBJECTIVE_LABEL[campaign.objective ?? ""] ?? titleCase(campaign.objective ?? "Sales");
    // An awareness/engagement campaign optimised for video views is graded as
    // video (the engine would otherwise grade it on reach).
    if (
      goal &&
      VIDEO_GOALS.has(goal) &&
      (objective === "Awareness" || objective === "Engagement")
    ) {
      objective = "Video views";
    }

    const eventType = adset?.promoted_object?.custom_event_type;
    let conversionGoal = eventType
      ? (CONVERSION_EVENT_LABEL[eventType] ?? titleCase(eventType))
      : undefined;
    if (!conversionGoal && goal === "LEAD_GENERATION") conversionGoal = "Lead";
    if (!conversionGoal && goal === "APP_INSTALLS") conversionGoal = "Install";

    let optimizationGoal = goal ? (OPTIMIZATION_LABEL[goal] ?? titleCase(goal)) : undefined;
    if (goal === "OFFSITE_CONVERSIONS" && conversionGoal)
      optimizationGoal = `Conversions — ${conversionGoal}`;
    if (goal === "VALUE")
      optimizationGoal = `Conversions — ${conversionGoal ?? "Purchase"} (value)`;

    const rawBid = campaign.bid_strategy ?? adset?.bid_strategy;
    const bidStrategy = rawBid ? (BID_STRATEGY_LABEL[rawBid] ?? titleCase(rawBid)) : undefined;

    // Only an explicit, unit-free Meta target maps cleanly onto the engine.
    let target: CampaignTarget | null = null;
    const roasFloor = num(adset?.bid_constraints?.roas_average_floor);
    if (rawBid === "LOWEST_COST_WITH_MIN_ROAS" && roasFloor > 0) {
      target = { type: "tROAS", value: roasFloor / 10000 };
    }

    const learning = adset?.learning_stage_info?.status;
    const learningStatus =
      learning === "LEARNING"
        ? "learning"
        : learning === "FAIL"
          ? "learning_limited"
          : learning === "SUCCESS"
            ? "active"
            : null;

    const types = conversionTypes(conversionGoal, objective);
    const engagement = objective === "Engagement";
    const startDate = datePart(campaign.start_time);
    const first = startDate && startDate > since ? startDate : since;

    const days: DailyMetric[] = [];
    for (let date = first; date <= until; date = addDays(date, 1)) {
      const row = rows.get(date);
      days.push(row ? toDailyMetric(row, types, engagement) : emptyDay(date));
    }

    const status = campaign.effective_status ?? campaign.status;
    result.push({
      campaignId: `${input.idPrefix}${campaign.id}`,
      campaignName: campaign.name?.trim() || `Campaign ${campaign.id}`,
      platform: "meta",
      objective,
      // Optional fields are omitted (not set to undefined) when Meta has no value.
      ...(optimizationGoal ? { optimizationGoal } : {}),
      ...(bidStrategy ? { bidStrategy } : {}),
      ...(conversionGoal ? { conversionGoal } : {}),
      ...(status ? { status } : {}),
      learningStatus,
      startDate,
      endDate: datePart(campaign.stop_time),
      // Meta's updated_time changes on any edit (even a rename), so it is not a
      // reliable "major edit" signal; leave it unknown for now.
      lastMajorEditDate: null,
      target,
      days,
    });
  }
  return result;
}
