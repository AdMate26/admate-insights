import type { Brand } from "../brands";
import type { Platform } from "../platforms";
import type { CampaignInput, DailyMetric, CampaignTarget } from "./engine";

/**
 * Objective-aware synthetic demo data.
 *
 * Each spec declares its objective / optimization goal / campaign type / bid
 * strategy / state / target, a baseline daily shape, and (optionally) a `recent`
 * modifier applied to the latest 7 days. Outcomes are DERIVED by the engine from
 * these metrics — the scenario label is never hard-coded onto the finding.
 */

const HISTORY = 14;

function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
const jit = (seed: string, spread = 0.05) => 1 + (seeded(seed) - 0.5) * 2 * spread;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type Recent = Partial<{
  ctr: number;
  cvr: number;
  cpc: number;
  cpm: number;
  freq: number; // >1 raises frequency (lowers reach)
  impr: number; // scale delivery
  rev: number;
  leadRate: number;
  lpvRate: number;
  viewRate: number;
  hook: number;
  lostRank: number;
  zeroResults: boolean; // force results to 0 in the recent window
}>;

type Base = Partial<{
  impr: number;
  ctr: number;
  cpc: number;
  cvr: number;
  aov: number;
  freq: number;
  leadRate: number;
  lpvRate: number;
  viewRate: number;
  hookRate: number;
  completion: number;
  focusedRatio: number;
  cpm: number;
  installRate: number;
  is: number;
  lostRank: number;
  lostBudget: number;
}>;

type Spec = {
  id: string;
  name: string;
  platform: Platform;
  objective: string;
  optimizationGoal?: string;
  campaignType?: string;
  bidStrategy?: string;
  conversionGoal?: string;
  status?: string;
  learningStatus?: "learning" | "learning_limited" | "active" | null;
  startOffset?: number; // days ago the campaign started
  endOffset?: number | null;
  lastEditOffset?: number; // days ago last major edit
  historyDays?: number;
  target?: CampaignTarget | null;
  tracking?: { conversionTrackingActive?: boolean; measurementError?: boolean };
  costModel?: "cpc" | "cpm";
  base: Base;
  recent?: Recent;
  /** Force zero results across the whole history (valid-zero scenarios). */
  zeroAll?: boolean;
};

function build(spec: Spec): CampaignInput {
  const b = spec.base;
  const historyDays = spec.historyDays ?? HISTORY;
  const costModel = spec.costModel ?? "cpc";
  const days: DailyMetric[] = [];

  for (let i = historyDays - 1; i >= 0; i--) {
    const offset = i; // 0 = yesterday, larger = older
    const date = isoDaysAgo(1 + offset);
    const recent = offset <= 6;
    const r = recent ? (spec.recent ?? {}) : {};
    const k = `${spec.id}:${date}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.92 : 1;

    const impr = (b.impr ?? 10000) * weekend * jit(`i${k}`) * (r.impr ?? 1);
    const ctr = (b.ctr ?? 0.02) * jit(`t${k}`, 0.04) * (r.ctr ?? 1);
    const cpc = (b.cpc ?? 0.8) * jit(`c${k}`, 0.04) * (r.cpc ?? 1);
    const cvr = (b.cvr ?? 0) * (r.cvr ?? 1);
    const clicks = Math.max(0, Math.round(impr * ctr));

    let spend: number;
    if (costModel === "cpm") {
      const cpm = (b.cpm ?? 6) * jit(`m${k}`, 0.03) * (r.cpm ?? 1);
      spend = (impr / 1000) * cpm;
    } else {
      spend = clicks * cpc * jit(`s${k}`, 0.03);
    }

    const zero = spec.zeroAll || r.zeroResults;
    const conversions = zero ? 0 : Math.round(clicks * cvr);
    const revenue = conversions * (b.aov ?? 0) * (r.rev ?? 1) * jit(`r${k}`, 0.04);
    const leads =
      b.leadRate != null ? (zero ? 0 : Math.round(clicks * b.leadRate * (r.leadRate ?? 1))) : undefined;
    const installs =
      b.installRate != null ? (zero ? 0 : Math.round(clicks * b.installRate)) : undefined;
    const landingPageViews =
      b.lpvRate != null ? Math.round(clicks * b.lpvRate * (r.lpvRate ?? 1)) : undefined;
    const videoViews =
      b.viewRate != null ? Math.round(impr * b.viewRate * (r.viewRate ?? 1)) : undefined;
    const focusedViews =
      b.focusedRatio != null && videoViews != null
        ? Math.round(videoViews * b.focusedRatio)
        : undefined;
    const videoWatched2s =
      b.hookRate != null ? Math.round(impr * b.hookRate * (r.hook ?? 1)) : undefined;
    const videoP100 =
      b.completion != null && videoViews != null ? Math.round(videoViews * b.completion) : undefined;
    const reach = b.freq != null ? Math.max(1, Math.round(impr / (b.freq * (r.freq ?? 1)))) : undefined;

    days.push({
      date,
      spend: Number(spend.toFixed(2)),
      impressions: Math.round(impr),
      clicks,
      conversions,
      revenue: Number(revenue.toFixed(2)),
      reach,
      landingPageViews,
      videoViews,
      focusedViews,
      videoWatched2s,
      videoP100,
      leads,
      installs,
      searchImpressionShare: b.is != null ? Math.min(0.98, b.is) : undefined,
      searchLostIsRank: b.lostRank != null ? (r.lostRank ?? b.lostRank) : undefined,
      searchLostIsBudget: b.lostBudget != null ? b.lostBudget : undefined,
    });
  }

  return {
    campaignId: spec.id,
    campaignName: spec.name,
    platform: spec.platform,
    objective: spec.objective,
    optimizationGoal: spec.optimizationGoal,
    campaignType: spec.campaignType,
    bidStrategy: spec.bidStrategy,
    conversionGoal: spec.conversionGoal,
    status: spec.status,
    learningStatus: spec.learningStatus ?? null,
    startDate: spec.startOffset != null ? isoDaysAgo(spec.startOffset) : isoDaysAgo(60),
    endDate: spec.endOffset != null ? isoDaysAgo(-spec.endOffset) : null,
    lastMajorEditDate: spec.lastEditOffset != null ? isoDaysAgo(spec.lastEditOffset) : null,
    target: spec.target ?? null,
    tracking: spec.tracking,
    days,
  };
}

/* ============================== META ==================================== */
const META: Spec[] = [
  {
    id: "m_sales_aplus",
    name: "Advantage+ Shopping",
    platform: "meta",
    objective: "Sales",
    optimizationGoal: "Conversions — Purchase (value)",
    conversionGoal: "Purchase",
    bidStrategy: "Highest value (target ROAS)",
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 42000, ctr: 0.02, cpc: 0.8, cvr: 0.04, aov: 72, freq: 1.9 },
    recent: { impr: 1.4 }, // healthy scaling
  },
  {
    id: "m_sales_abo",
    name: "ABO | Prospecting | UGC hooks",
    platform: "meta",
    objective: "Sales",
    optimizationGoal: "Conversions — Purchase",
    conversionGoal: "Purchase",
    bidStrategy: "Highest volume",
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 52000, ctr: 0.02, cpc: 0.8, cvr: 0.04, aov: 60, freq: 2.0 },
    recent: { ctr: 0.65, cpc: 1.35, freq: 1.7 }, // creative fatigue
  },
  {
    id: "m_sales_retarget",
    name: "Retargeting | 7d add-to-cart",
    platform: "meta",
    objective: "Sales",
    optimizationGoal: "Conversions — Purchase",
    conversionGoal: "Purchase",
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 30000, ctr: 0.03, cpc: 0.9, cvr: 0.05, aov: 57.6, freq: 2.6 },
    recent: { cvr: 0.5 }, // post-click drop-off
  },
  {
    id: "m_leads_wholesale",
    name: "Lead form | Wholesale enquiries",
    platform: "meta",
    objective: "Leads",
    optimizationGoal: "Leads — Instant form",
    conversionGoal: "Lead",
    target: { type: "cpl", value: 12 },
    base: { impr: 22000, ctr: 0.02, cpc: 1.0, leadRate: 0.1 },
    recent: { leadRate: 0.5, cpc: 1.15 }, // lead-funnel weakness
  },
  {
    id: "m_awareness_reach",
    name: "Reach | Spring launch",
    platform: "meta",
    objective: "Awareness",
    optimizationGoal: "Reach",
    costModel: "cpm",
    base: { impr: 200000, ctr: 0.006, cpc: 0.9, cpm: 5.0, freq: 1.8 },
    recent: { cpm: 1.35 }, // auction pressure
  },
  {
    id: "m_sales_cbo_learn",
    name: "CBO | Broad | Video",
    platform: "meta",
    objective: "Sales",
    optimizationGoal: "Conversions — Purchase",
    conversionGoal: "Purchase",
    learningStatus: "learning",
    startOffset: 9,
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 30000, ctr: 0.018, cpc: 0.85, cvr: 0.035, aov: 62, freq: 1.6 },
  },
  {
    id: "m_sales_catalogue_track",
    name: "Catalogue | Dynamic retarget",
    platform: "meta",
    objective: "Sales",
    optimizationGoal: "Conversions — Purchase",
    conversionGoal: "Purchase",
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 26000, ctr: 0.028, cpc: 0.85, cvr: 0.05, aov: 68, freq: 2.4 },
    recent: { zeroResults: true }, // conversions stopped recording → Error
  },
  {
    id: "m_traffic_guide",
    name: "Traffic | Guide to catalogue",
    platform: "meta",
    objective: "Traffic",
    optimizationGoal: "Landing page views",
    startOffset: 10,
    historyDays: 10, // insufficient history → In Review
    base: { impr: 40000, ctr: 0.03, cpc: 0.4, lpvRate: 0.82 },
  },
];

/* ============================== TIKTOK ================================== */
const TIKTOK: Spec[] = [
  {
    id: "t_video_trend",
    name: "Video views | Trending sounds",
    platform: "tiktok",
    objective: "Video views",
    optimizationGoal: "Focused view",
    costModel: "cpm",
    base: { impr: 260000, ctr: 0.006, cpc: 0.5, cpm: 3.5, viewRate: 0.18, focusedRatio: 0.68, hookRate: 0.34, completion: 0.11, freq: 1.5 },
    recent: { hook: 0.6, viewRate: 0.8, cpm: 1.15 }, // weak hook
  },
  {
    id: "t_sales_spark",
    name: "Spark Ads | Creator whitelist",
    platform: "tiktok",
    objective: "Website conversions",
    optimizationGoal: "Complete payment (value)",
    conversionGoal: "Complete payment",
    bidStrategy: "Value optimization",
    target: { type: "tROAS", value: 2.8 },
    base: { impr: 90000, ctr: 0.012, cpc: 0.45, cvr: 0.03, aov: 58, freq: 1.7 },
  },
  {
    id: "t_sales_smartplus_zero",
    name: "Smart+ | Catalogue sales",
    platform: "tiktok",
    objective: "Product sales",
    optimizationGoal: "Complete payment",
    conversionGoal: "Complete payment",
    tracking: { conversionTrackingActive: true },
    target: { type: "tCPA", value: 35 },
    base: { impr: 34000, ctr: 0.014, cpc: 0.5, cvr: 0 }, // valid zero conversions, enough traffic → Low
    zeroAll: true,
  },
  {
    id: "t_sales_quality",
    name: "Lookalike 3% | Site visitors",
    platform: "tiktok",
    objective: "Website conversions",
    optimizationGoal: "Complete payment",
    conversionGoal: "Complete payment",
    base: { impr: 70000, ctr: 0.013, cpc: 0.5, cvr: 0.03, aov: 60, freq: 1.8 },
    recent: { ctr: 1.3, cvr: 0.75, cpc: 0.77 }, // traffic-quality drift (attention up, quality down)
  },
  {
    id: "t_sales_vsa_new",
    name: "VSA | Broad 18-34",
    platform: "tiktok",
    objective: "Website conversions",
    optimizationGoal: "Complete payment",
    conversionGoal: "Complete payment",
    startOffset: 4,
    historyDays: 5, // new campaign → In Review
    base: { impr: 30000, ctr: 0.013, cpc: 0.5, cvr: 0.03, aov: 60, freq: 1.4 },
  },
  {
    id: "t_leads_form",
    name: "Instant form | Sign-ups",
    platform: "tiktok",
    objective: "Lead generation",
    optimizationGoal: "Leads — Instant form",
    conversionGoal: "Lead",
    target: { type: "cpl", value: 14 },
    base: { impr: 3000, ctr: 0.012, cpc: 0.6, leadRate: 0.03 }, // ~7 leads/wk → insufficient results → In Review
  },
  {
    id: "t_awareness_reach",
    name: "Reach | Launch takeover",
    platform: "tiktok",
    objective: "Reach",
    optimizationGoal: "Reach",
    costModel: "cpm",
    base: { impr: 240000, ctr: 0.005, cpc: 0.4, cpm: 3.2, freq: 1.7 }, // healthy/steady vs baseline
  },
];

/* ============================== GOOGLE ================================== */
const GOOGLE: Spec[] = [
  {
    id: "g_search_nonbrand",
    name: "Search | Non-brand high-intent",
    platform: "google_search",
    objective: "Sales",
    campaignType: "Search",
    bidStrategy: "Target CPA",
    conversionGoal: "Purchase",
    target: { type: "tCPA", value: 35 },
    base: { impr: 8000, ctr: 0.05, cpc: 1.5, cvr: 0.05, aov: 120, is: 0.6, lostRank: 0.14, lostBudget: 0.08 },
    recent: { ctr: 0.8, cvr: 0.7, lostRank: 0.26 }, // search-intent mismatch
  },
  {
    id: "g_pmax_all",
    name: "PMax | All products",
    platform: "google_search",
    objective: "Sales",
    campaignType: "Performance Max",
    bidStrategy: "Target ROAS",
    conversionGoal: "Purchase",
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 60000, ctr: 0.02, cpc: 0.9, cvr: 0.04, aov: 85, freq: 1.4 },
    recent: { cvr: 0.6 }, // value/conversion issue
  },
  {
    id: "g_shopping_learn",
    name: "Shopping | Standard",
    platform: "google_search",
    objective: "Sales",
    campaignType: "Shopping",
    bidStrategy: "Maximize conversion value",
    conversionGoal: "Purchase",
    learningStatus: "learning",
    startOffset: 8,
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 30000, ctr: 0.018, cpc: 0.8, cvr: 0.035, aov: 100 },
  },
  {
    id: "g_search_brand",
    name: "Search | Brand exact",
    platform: "google_search",
    objective: "Sales",
    campaignType: "Search",
    bidStrategy: "Target ROAS",
    conversionGoal: "Purchase",
    target: { type: "tROAS", value: 3.0 },
    base: { impr: 12000, ctr: 0.11, cpc: 0.8, cvr: 0.06, aov: 120, is: 0.85, lostRank: 0.05, lostBudget: 0.04 }, // strong brand → High
  },
  {
    id: "g_search_category",
    name: "Search | Category terms",
    platform: "google_search",
    objective: "Traffic",
    optimizationGoal: "Clicks",
    campaignType: "Search",
    bidStrategy: "Maximize clicks",
    lastEditOffset: 3, // recently edited → In Review
    base: { impr: 20000, ctr: 0.06, cpc: 0.7 },
  },
  {
    id: "g_demandgen_yt",
    name: "Demand Gen | YouTube",
    platform: "google_search",
    objective: "Video views",
    campaignType: "Demand Gen",
    optimizationGoal: "Views",
    costModel: "cpm",
    // Missing optional metrics: only videoViews present (no hook/completion/focused).
    base: { impr: 180000, ctr: 0.008, cpc: 0.6, cpm: 8, viewRate: 0.28 },
  },
];

/* ============================== LINKEDIN =============================== */
/**
 * LinkedIn Ads (Campaign Manager) objectives, judged the LinkedIn way: each
 * campaign is graded on the metric its objective was actually bought against —
 * awareness on CPM/reach, website visits on CPC/CTR, engagement on cost per
 * engagement, video on cost per view, lead gen on CPL, website conversions on
 * CPA (or ROAS only where a conversion value exists), job applicants on cost
 * per applicant. LinkedIn CPMs/CPCs are intentionally high (B2B auction).
 */
const LINKEDIN: Spec[] = [
  {
    id: "li_leads_b2b",
    name: "Lead Gen Form | Enterprise demo requests",
    platform: "linkedin",
    objective: "Lead Generation",
    optimizationGoal: "Lead Gen Form completions",
    conversionGoal: "Lead",
    target: { type: "cpl", value: 95 },
    base: { impr: 42000, ctr: 0.008, cpc: 9.5, leadRate: 0.13 }, // CPL ~$73 < target → High
  },
  {
    id: "li_awareness_tl",
    name: "Brand Awareness | Thought leadership",
    platform: "linkedin",
    objective: "Brand Awareness",
    optimizationGoal: "Reach",
    costModel: "cpm",
    base: { impr: 130000, ctr: 0.006, cpc: 8, cpm: 32, freq: 2.2 },
    recent: { cpm: 1.22 }, // CPM +22% vs own baseline → auction pressure
  },
  {
    id: "li_video_brand",
    name: "Video Views | Product story",
    platform: "linkedin",
    objective: "Video Views",
    optimizationGoal: "Video views",
    costModel: "cpm",
    base: { impr: 95000, ctr: 0.005, cpc: 8, cpm: 38, viewRate: 0.24 },
    recent: { viewRate: 0.72, cpm: 1.1 }, // view rate -28% → cost / view rises
  },
  {
    id: "li_conv_value",
    name: "Website Conversions | Value-tracked signups",
    platform: "linkedin",
    objective: "Website Conversions",
    optimizationGoal: "Website conversions",
    conversionGoal: "Sign-up",
    bidStrategy: "Maximize conversion value",
    target: { type: "tROAS", value: 2.0 },
    // Conversion VALUE exists (aov) → judged on ROAS. Without a value the engine
    // falls back to CPA and never invents ROAS (covered in engine.test.ts).
    base: { impr: 50000, ctr: 0.008, cpc: 10, cvr: 0.04, aov: 650 }, // ROAS ~2.6 → High
  },
  {
    id: "li_visits_content",
    name: "Website Visits | Resources & blog",
    platform: "linkedin",
    objective: "Website Visits",
    optimizationGoal: "Website clicks",
    base: { impr: 60000, ctr: 0.009, cpc: 8 },
    recent: { cpc: 1.16 }, // CPC drifting up vs baseline → mild caution
  },
  {
    id: "li_engagement_follow",
    name: "Engagement | Follower + reactions",
    platform: "linkedin",
    objective: "Engagement",
    optimizationGoal: "Engagement",
    base: { impr: 70000, ctr: 0.012, cpc: 6 }, // steady cost per engagement
  },
  {
    id: "li_jobs_eng",
    name: "Job Applicants | Engineering roles",
    platform: "linkedin",
    objective: "Job Applicants",
    optimizationGoal: "Apply clicks",
    conversionGoal: "Applicant",
    target: { type: "cpl", value: 45 },
    base: { impr: 30000, ctr: 0.01, cpc: 6, leadRate: 0.18 }, // cost/applicant ~$33 < target → High
  },
];

const BY_PLATFORM: Record<Platform, Spec[]> = {
  meta: META,
  tiktok: TIKTOK,
  google_search: GOOGLE,
  linkedin: LINKEDIN,
};

/**
 * Platform-level pool (every synthetic campaign for a platform, brand-agnostic).
 * Kept stable so platform-only callers and the engine regression suite continue
 * to see the exact same campaign ids (m_*, t_*, g_*) and verdicts.
 */
export function getDemoCampaigns(platform: Platform): CampaignInput[] {
  return BY_PLATFORM[platform].map(build);
}

/* ============================== BRANDS ================================== */
/**
 * Brand scoping is an ORGANISATIONAL layer only: each brand connects a subset of
 * platforms and, per connected platform, runs a subset of that platform's
 * campaign structures as its own accounts. We reuse the *same* tuned specs (so
 * the platform-specific analysis rules are untouched) and simply clone them with
 * a brand-scoped id. Verdicts are still derived per platform by the existing
 * analyzer — a brand never blends metrics across Meta / TikTok / Google.
 */

const SPEC_BY_ID: Record<Platform, Record<string, Spec>> = {
  meta: Object.fromEntries(META.map((s) => [s.id, s])),
  tiktok: Object.fromEntries(TIKTOK.map((s) => [s.id, s])),
  google_search: Object.fromEntries(GOOGLE.map((s) => [s.id, s])),
  linkedin: Object.fromEntries(LINKEDIN.map((s) => [s.id, s])),
};

/**
 * Which of each platform's campaign structures each brand actually runs. Every
 * id references an existing, already-tested spec — no new analysis rules are
 * introduced, only a realistic account/campaign selection per brand.
 */
const BRAND_ACCOUNTS: Record<Brand, Partial<Record<Platform, string[]>>> = {
  northlane: {
    meta: [
      "m_sales_aplus",
      "m_sales_abo",
      "m_sales_retarget",
      "m_leads_wholesale",
      "m_awareness_reach",
      "m_sales_cbo_learn",
      "m_sales_catalogue_track",
      "m_traffic_guide",
    ],
    tiktok: [
      "t_video_trend",
      "t_sales_spark",
      "t_sales_smartplus_zero",
      "t_sales_quality",
      "t_sales_vsa_new",
      "t_leads_form",
      "t_awareness_reach",
    ],
    google_search: [
      "g_search_nonbrand",
      "g_pmax_all",
      "g_shopping_learn",
      "g_search_brand",
      "g_search_category",
      "g_demandgen_yt",
    ],
    linkedin: ["li_leads_b2b", "li_awareness_tl", "li_video_brand", "li_conv_value"],
  },
  olive: {
    meta: [
      "m_sales_aplus",
      "m_sales_abo",
      "m_leads_wholesale",
      "m_awareness_reach",
      "m_sales_cbo_learn",
    ],
    google_search: ["g_search_brand", "g_search_nonbrand", "g_shopping_learn", "g_demandgen_yt"],
  },
  kite: {
    tiktok: [
      "t_sales_spark",
      "t_video_trend",
      "t_sales_quality",
      "t_sales_smartplus_zero",
      "t_awareness_reach",
    ],
    meta: ["m_sales_aplus", "m_sales_retarget", "m_sales_abo", "m_traffic_guide"],
    linkedin: ["li_visits_content", "li_engagement_follow", "li_jobs_eng"],
  },
};

/**
 * Clone a platform spec into a brand-scoped campaign. The id is namespaced by
 * brand (so two brands running the same structure never collide and are never
 * confused for one another), while the verdict-driving `base`/`recent` shape is
 * preserved verbatim — the analyzer therefore reaches the same conclusion it
 * would for that structure. Deterministic per-campaign jitter (seeded on the
 * new id) gives each brand realistic, but reproducible, day-to-day numbers.
 */
function cloneForBrand(brand: Brand, spec: Spec): Spec {
  return { ...spec, id: `${brand}__${spec.id}` };
}

/**
 * A single brand's campaigns for ONE connected platform. Returns an empty list
 * if the brand hasn't connected that platform — callers should only ask for a
 * brand's connected platforms.
 */
export function getDemoCampaignsForBrand(brand: Brand, platform: Platform): CampaignInput[] {
  const ids = BRAND_ACCOUNTS[brand]?.[platform] ?? [];
  const pool = SPEC_BY_ID[platform];
  return ids
    .map((id) => pool[id])
    .filter((s): s is Spec => Boolean(s))
    .map((s) => build(cloneForBrand(brand, s)));
}
