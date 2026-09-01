import type {
  AdsDataProvider,
  NormalizedDailyRow,
  ProviderFetchParams,
  ProviderRawRow,
} from "./contract";

/**
 * DemoTikTokDataProvider
 *
 * Generates realistic synthetic TikTok Ads data (campaign / ad group / ad,
 * daily metrics) over a multi-week period, using TikTok-API-like raw field
 * names so the normalization layer has real mapping work to do.
 *
 * Intentional patterns baked in for the analysis engine to detect:
 *  - CPA spike on the retargeting campaign in the most recent week
 *  - CTR drop + frequency climb (creative fatigue) on one ad
 *  - Budget pacing issue (chronic underspend) on the prospecting campaign
 *  - Conversion-rate/ROAS break on one ad group
 */

type TikTokRawRow = {
  stat_time_day: string;
  campaign_id: string;
  campaign_name: string;
  adgroup_id: string;
  adgroup_name: string;
  ad_id: string;
  ad_name: string;
  metrics: {
    spend: string;
    impressions: string;
    clicks: string;
    conversions: string;
    total_complete_payment_rate: string; // revenue, as TikTok returns strings
    reach: string;
    budget: string;
  };
};

type AdSpec = {
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  baseImpressions: number;
  baseCtr: number;
  baseCpc: number;
  baseCvr: number;
  aov: number;
  dailyBudget: number;
  pattern: "stable" | "cpa_spike" | "creative_fatigue" | "underspend" | "cvr_break";
};

const ADS: AdSpec[] = [
  {
    campaignId: "c_1001",
    campaignName: "Prospecting | Broad | US",
    adsetId: "ag_2001",
    adsetName: "Broad 18-34",
    adId: "ad_3001",
    adName: "UGC Hook — Unboxing",
    baseImpressions: 210_000,
    baseCtr: 0.0125,
    baseCpc: 0.42,
    baseCvr: 0.031,
    aov: 62,
    dailyBudget: 900,
    pattern: "underspend",
  },
  {
    campaignId: "c_1001",
    campaignName: "Prospecting | Broad | US",
    adsetId: "ag_2002",
    adsetName: "Interest — Fitness",
    adId: "ad_3002",
    adName: "Studio Demo — 15s",
    baseImpressions: 160_000,
    baseCtr: 0.0142,
    baseCpc: 0.39,
    baseCvr: 0.028,
    aov: 58,
    dailyBudget: 700,
    pattern: "creative_fatigue",
  },
  {
    campaignId: "c_1002",
    campaignName: "Retargeting | Site Visitors 14d",
    adsetId: "ag_2003",
    adsetName: "ATC 14d",
    adId: "ad_3003",
    adName: "Offer — Free Shipping",
    baseImpressions: 74_000,
    baseCtr: 0.0231,
    baseCpc: 0.55,
    baseCvr: 0.061,
    aov: 71,
    dailyBudget: 500,
    pattern: "cpa_spike",
  },
  {
    campaignId: "c_1002",
    campaignName: "Retargeting | Site Visitors 14d",
    adsetId: "ag_2004",
    adsetName: "Viewers 7d",
    adId: "ad_3004",
    adName: "Testimonial — Carousel",
    baseImpressions: 61_000,
    baseCtr: 0.0198,
    baseCpc: 0.51,
    baseCvr: 0.049,
    aov: 68,
    dailyBudget: 400,
    pattern: "cvr_break",
  },
  {
    campaignId: "c_1003",
    campaignName: "Always-On | Catalog Sales",
    adsetId: "ag_2005",
    adsetName: "Catalog — Bestsellers",
    adId: "ad_3005",
    adName: "Dynamic Product Ad",
    baseImpressions: 128_000,
    baseCtr: 0.0161,
    baseCpc: 0.46,
    baseCvr: 0.038,
    aov: 64,
    dailyBudget: 650,
    pattern: "stable",
  },
];

/** Deterministic pseudo-random so runs are reproducible per day+ad. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function jitter(seed: string, spread: number): number {
  return 1 + (seeded(seed) - 0.5) * 2 * spread;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class DemoTikTokDataProvider implements AdsDataProvider<TikTokRawRow> {
  readonly id = "demo";
  readonly label = "Demo TikTok Ads (synthetic)";

  async fetchDailyPerformance({ days }: ProviderFetchParams): Promise<TikTokRawRow[]> {
    const rows: TikTokRawRow[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);

    for (let offset = days - 1; offset >= 0; offset--) {
      const day = new Date(end);
      day.setUTCDate(end.getUTCDate() - offset);
      const date = isoDate(day);
      // daysAgo: 0 = most recent day
      const daysAgo = offset;
      const dow = day.getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 0.88 : 1;

      for (const ad of ADS) {
        rows.push(this.buildRow(ad, date, daysAgo, weekend));
      }
    }
    return rows;
  }

  private buildRow(ad: AdSpec, date: string, daysAgo: number, weekend: number): TikTokRawRow {
    const key = `${ad.adId}:${date}`;
    let impressions = ad.baseImpressions * weekend * jitter(`i${key}`, 0.12);
    let ctr = ad.baseCtr * jitter(`t${key}`, 0.08);
    let cpc = ad.baseCpc * jitter(`c${key}`, 0.07);
    let cvr = ad.baseCvr * jitter(`v${key}`, 0.1);
    let reachRatio = 0.72;
    let spendCapRatio = 1;

    // --- baked-in patterns -------------------------------------------------
    if (ad.pattern === "cpa_spike" && daysAgo <= 4) {
      // auction pressure: CPC up hard, CVR slightly down => CPA spike
      cpc *= 1.62;
      cvr *= 0.82;
      impressions *= 1.05;
    }
    if (ad.pattern === "creative_fatigue") {
      // gradual CTR decay + rising frequency over the last 10 days
      const decay = daysAgo <= 10 ? 1 - (10 - daysAgo) * 0.045 : 1;
      ctr *= decay;
      reachRatio = daysAgo <= 10 ? 0.72 - (10 - daysAgo) * 0.035 : 0.72;
      cpc *= daysAgo <= 10 ? 1 + (10 - daysAgo) * 0.02 : 1;
    }
    if (ad.pattern === "underspend") {
      // chronic pacing issue: delivery only uses part of the daily budget
      spendCapRatio = daysAgo <= 12 ? 0.54 : 0.93;
    }
    if (ad.pattern === "cvr_break" && daysAgo <= 6) {
      // landing/checkout issue: clicks fine, conversions collapse
      cvr *= 0.46;
    }

    const clicks = Math.max(1, Math.round(impressions * ctr));
    let spend = clicks * cpc;
    const budgetCap = ad.dailyBudget * spendCapRatio;
    if (spend > budgetCap) {
      const scale = budgetCap / spend;
      spend = budgetCap;
      impressions *= scale;
    }
    const conversions = Math.max(0, Math.round(clicks * cvr));
    const revenue = conversions * ad.aov * jitter(`r${key}`, 0.08);
    const reach = Math.max(1, Math.round(impressions * Math.max(0.3, reachRatio)));

    return {
      stat_time_day: `${date} 00:00:00`,
      campaign_id: ad.campaignId,
      campaign_name: ad.campaignName,
      adgroup_id: ad.adsetId,
      adgroup_name: ad.adsetName,
      ad_id: ad.adId,
      ad_name: ad.adName,
      metrics: {
        spend: spend.toFixed(2),
        impressions: String(Math.round(impressions)),
        clicks: String(clicks),
        conversions: String(conversions),
        total_complete_payment_rate: revenue.toFixed(2),
        reach: String(reach),
        budget: ad.dailyBudget.toFixed(2),
      },
    };
  }

  normalizeRow(raw: TikTokRawRow): NormalizedDailyRow {
    const m = raw.metrics;
    return {
      date: raw.stat_time_day.slice(0, 10),
      campaignId: raw.campaign_id,
      campaignName: raw.campaign_name,
      adsetId: raw.adgroup_id,
      adsetName: raw.adgroup_name,
      adId: raw.ad_id,
      adName: raw.ad_name,
      spend: Number(m.spend),
      impressions: Number(m.impressions),
      clicks: Number(m.clicks),
      conversions: Number(m.conversions),
      revenue: Number(m.total_complete_payment_rate),
      reach: Number(m.reach),
      dailyBudget: Number(m.budget),
    };
  }
}

export type { ProviderRawRow };
