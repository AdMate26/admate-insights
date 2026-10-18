import { addDays, toISO, weekday } from "../dates";
import { emptyMeasures, type Measures } from "../metrics/measures";
import type { Objective } from "../metrics/objectives";
import type { Platform } from "../ingest/headers";
import type { NormalizedRow } from "../ingest/normalize";

// Deterministic PRNG so the sample account looks the same every time.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CampaignSpec {
  name: string;
  platform: Platform;
  objective: Objective;
  dailySpend: number;
  cpm: number;
  ctr: number; // link clicks / impressions
  cvr: number; // results / link clicks (post-click), or results / impressions (on-platform)
  aov?: number;
  status?: string;
  // Planted issue applied over the last `days` days of the window.
  issue?: { kind: "tracking" | "fatigue" | "cpm_spike" | "cvr_drop" | "wasted"; days: number };
  budget?: number;
}

export interface SampleClient {
  name: string;
  industry: string;
  country?: string;
  currency: string;
  goals: { objective: Objective; target?: number; marginPct?: number; leadToCustomerPct?: number; profitPerCustomer?: number }[];
  campaigns: CampaignSpec[];
}

export const SAMPLE_CLIENTS: SampleClient[] = [
  {
    name: "Acme Dental (sample)",
    industry: "Local services",
    currency: "USD",
    goals: [
      { objective: "leads", target: 25, leadToCustomerPct: 20, profitPerCustomer: 400 },
      { objective: "messages", target: 6 },
    ],
    campaigns: [
      { name: "Leads | Broad | Whitening offer", platform: "meta", objective: "leads", dailySpend: 90, cpm: 9, ctr: 0.012, cvr: 0.09, issue: { kind: "tracking", days: 2 } },
      { name: "Leads | Retargeting 30d", platform: "meta", objective: "leads", dailySpend: 35, cpm: 14, ctr: 0.018, cvr: 0.12 },
      { name: "Messages | Click-to-WhatsApp", platform: "meta", objective: "messages", dailySpend: 40, cpm: 8, ctr: 0.015, cvr: 0.35 },
      { name: "Search | Dentist near me", platform: "google", objective: "leads", dailySpend: 70, cpm: 55, ctr: 0.06, cvr: 0.07 },
      { name: "Search | Emergency dentist", platform: "google", objective: "leads", dailySpend: 25, cpm: 60, ctr: 0.05, cvr: 0.01, issue: { kind: "wasted", days: 30 } },
    ],
  },
  {
    name: "Bloom Co (sample)",
    industry: "E-commerce",
    currency: "USD",
    goals: [{ objective: "sales", target: 2.5, marginPct: 45 }],
    campaigns: [
      { name: "Sales | ASC | UGC v3", platform: "meta", objective: "sales", dailySpend: 160, cpm: 12, ctr: 0.014, cvr: 0.035, aov: 62, issue: { kind: "fatigue", days: 10 } },
      { name: "Sales | Catalog retargeting", platform: "meta", objective: "sales", dailySpend: 45, cpm: 16, ctr: 0.02, cvr: 0.06, aov: 70, budget: 45 },
      { name: "Spark Ads | Creator bundle", platform: "tiktok", objective: "sales", dailySpend: 80, cpm: 7, ctr: 0.011, cvr: 0.022, aov: 58, issue: { kind: "cpm_spike", days: 7 } },
      { name: "PMax | All products", platform: "google", objective: "sales", dailySpend: 110, cpm: 20, ctr: 0.018, cvr: 0.045, aov: 66, issue: { kind: "cvr_drop", days: 7 } },
      { name: "Awareness | Brand video", platform: "tiktok", objective: "awareness", dailySpend: 30, cpm: 3.2, ctr: 0.004, cvr: 0 },
    ],
  },
  {
    name: "Northwind B2B (sample)",
    industry: "B2B",
    currency: "USD",
    goals: [{ objective: "leads", target: 90 }],
    campaigns: [
      { name: "LI | Decision makers | Guide", platform: "linkedin", objective: "leads", dailySpend: 150, cpm: 38, ctr: 0.009, cvr: 0.13 },
      { name: "LI | Retarget | Demo", platform: "linkedin", objective: "leads", dailySpend: 20, cpm: 45, ctr: 0.012, cvr: 0.3, budget: 20 },
      { name: "Search | CRM software", platform: "google", objective: "leads", dailySpend: 120, cpm: 70, ctr: 0.045, cvr: 0.05 },
      { name: "Meta | Lookalike | Guide", platform: "meta", objective: "leads", dailySpend: 60, cpm: 11, ctr: 0.01, cvr: 0.08 },
    ],
  },
];

// The sample account loaded by "Try with sample data": one business running its
// own ads on Meta and TikTok, with mixed objectives (messages, sales, leads,
// traffic, followers, awareness, engagement, video views, app installs, app
// registrations, website visits) and a few planted issues
// (creative fatigue, a tracking break, a checkout problem, a CPM spike) and one
// under-funded winner. Leads has no target, to show how AdMate judges without one.
export const SAMPLE_ACCOUNT: SampleClient = {
  name: "Lotus Skincare (sample)",
  industry: "Beauty & retail",
  country: "Cambodia",
  currency: "USD",
  goals: [
    { objective: "messages", target: 1.2 },
    { objective: "sales", target: 3, marginPct: 50 },
  ],
  campaigns: [
    { name: "Messages | Broad | Promo video", platform: "meta", objective: "messages", dailySpend: 50, cpm: 3.2, ctr: 0.014, cvr: 0.28, issue: { kind: "fatigue", days: 10 } },
    { name: "Messages | Retargeting 30d", platform: "meta", objective: "messages", dailySpend: 7, cpm: 4.5, ctr: 0.022, cvr: 0.42, budget: 7 },
    { name: "Sales | Website | Catalog", platform: "meta", objective: "sales", dailySpend: 90, cpm: 5, ctr: 0.013, cvr: 0.04, aov: 28, issue: { kind: "cvr_drop", days: 7 } },
    { name: "Leads | Skin quiz form", platform: "meta", objective: "leads", dailySpend: 18, cpm: 3.8, ctr: 0.011, cvr: 0.14, issue: { kind: "tracking", days: 2 } },
    { name: "TT | Traffic | Creator review", platform: "tiktok", objective: "traffic", dailySpend: 20, cpm: 1.4, ctr: 0.009, cvr: 0 },
    { name: "TT | Followers | Brand", platform: "tiktok", objective: "followers", dailySpend: 25, cpm: 0.9, ctr: 0.004, cvr: 0.012, issue: { kind: "cpm_spike", days: 7 } },
    // Top-of-funnel objectives, so the sample shows how each is judged (added after
    // the campaigns above, so their numbers stay the same).
    { name: "TT | Awareness | Brand video", platform: "tiktok", objective: "awareness", dailySpend: 6, cpm: 0.8, ctr: 0.003, cvr: 0 },
    { name: "Engagement | Post boost | New serum", platform: "meta", objective: "engagement", dailySpend: 4, cpm: 2.5, ctr: 0.01, cvr: 0.04 },
    { name: "Video views | ThruPlay | How-to routine", platform: "meta", objective: "video_views", dailySpend: 5, cpm: 2, ctr: 0.006, cvr: 0.22 },
    // App and website objectives: cvr = installs, sign-ups or page loads per link click.
    { name: "App | Installs | Lotus Rewards app", platform: "meta", objective: "app_installs", dailySpend: 3, cpm: 4, ctr: 0.015, cvr: 0.3 },
    { name: "App | Registrations | Lotus Rewards app", platform: "tiktok", objective: "app_registrations", dailySpend: 3, cpm: 1.5, ctr: 0.012, cvr: 0.12 },
    { name: "Website | Landing page views | Skin guide", platform: "meta", objective: "website_visits", dailySpend: 3, cpm: 3, ctr: 0.012, cvr: 0.75 },
  ],
};

// Ad set and ad variants inside every sample campaign. Broad audiences are
// cheaper to reach; the UGC video gets more clicks, the static offer converts a bit better.
const AD_SETS = [
  { name: "Broad audience", share: 0.55, cpm: 0.85, freq: 1 },
  { name: "Interest audience", share: 0.45, cpm: 1.2, freq: 1.15 },
];
const ADS = [
  { name: "UGC video hook", share: 0.6, ctr: 1.3, cvr: 0.95 },
  { name: "Static offer", share: 0.4, ctr: 0.75, cvr: 1.1 },
];

// Poisson-ish integer noise around an expected count.
function draw(r: () => number, expected: number): number {
  if (expected <= 0) return 0;
  const sd = Math.sqrt(expected);
  const u = Math.max(1e-9, r());
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0, Math.round(expected + z * sd));
}

// Daily rows for one client, grouped by platform (one "upload" per platform).
export function generateClientRows(client: SampleClient, endDate: string, days = 90, seed = 7): Map<Platform, NormalizedRow[]> {
  const r = rng(seed + client.name.length * 31);
  const out = new Map<Platform, NormalizedRow[]>();
  const start = addDays(endDate, -(days - 1));
  for (const c of client.campaigns) {
    const rows = out.get(c.platform) ?? [];
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const fromEnd = days - 1 - i; // 0 = last day
      const inIssue = c.issue && fromEnd < c.issue.days;
      const wk = weekday(date);
      const weekend = wk === 0 || wk === 6 ? 0.85 : 1.05;
      const spend = c.dailySpend * weekend * (0.9 + r() * 0.2);
      let cpm = c.cpm * (0.93 + r() * 0.14);
      let ctr = c.ctr;
      let cvr = c.cvr;
      let freqBoost = 1;
      if (inIssue && c.issue) {
        const progress = (c.issue.days - fromEnd) / c.issue.days;
        if (c.issue.kind === "cpm_spike") cpm *= 1.45;
        if (c.issue.kind === "fatigue") {
          ctr *= 1 - 0.45 * progress;
          freqBoost = 1 + 0.9 * progress;
        }
        if (c.issue.kind === "cvr_drop") cvr *= 0.45;
      }
      if (c.issue?.kind === "wasted") cvr = 0.001;
      // Split each campaign day into 2 ad sets × 2 ads with realistic differences,
      // so ad set / ad drill-down and "what to learn" have something to find.
      for (const set of AD_SETS) {
        for (const ad of ADS) {
          const share = set.share * ad.share;
          const aSpend = spend * share;
          const aCpm = cpm * set.cpm;
          const impressions = Math.round((aSpend / aCpm) * 1000);
          const reach = Math.round(impressions / (1.35 * freqBoost * set.freq + r() * 0.2));
          const linkClicks = draw(r, impressions * ctr * ad.ctr);
          const m: Measures = emptyMeasures();
          m.spend = Math.round(aSpend * 100) / 100;
          m.impressions = impressions;
          m.reach = reach;
          m.linkClicks = linkClicks;
          m.clicksAll = Math.round(linkClicks * 1.6);
          // Post-click results come from clicks; on-platform results (follows, views) from impressions.
          const onPlatform = c.objective === "followers" || c.objective === "engagement" || c.objective === "video_views";
          let results = c.objective === "awareness" || c.objective === "traffic" ? 0 : draw(r, (onPlatform ? impressions : linkClicks) * cvr * ad.cvr);
          if (inIssue && c.issue?.kind === "tracking") results = 0;
          if (c.issue?.kind === "wasted") results = 0;
          switch (c.objective) {
            case "leads": m.leads = results; break;
            case "messages": m.messages = results; break;
            case "sales":
              m.purchases = results;
              m.conversionValue = Math.round(results * (c.aov ?? 50) * (0.85 + r() * 0.3) * 100) / 100;
              break;
            case "app_installs": m.installs = results; break;
            case "app_registrations": m.registrations = results; break;
            case "website_visits": m.landingPageViews = results; break;
            case "followers": m.follows = results; break;
            case "engagement": m.engagements = results; break;
            case "video_views": m.videoViews = results; break;
            default: break;
          }
          const setName = `${c.name.split("|").pop()!.trim()} · ${set.name}`;
          rows.push({
            campaign: c.name, campaignId: null, adGroup: setName, adGroupId: null, ad: `${setName} · ${ad.name}`, adId: null,
            date, periodStart: null, periodEnd: null, status: c.status ?? "active", secondaryStatus: null,
            objective: c.objective, objectiveSource: "platform_objective", budget: c.budget ?? null, measures: m,
          });
        }
      }
    }
    out.set(c.platform, rows);
  }
  return out;
}

export function sampleEndDate(): string {
  return addDays(toISO(new Date()), -1);
}
