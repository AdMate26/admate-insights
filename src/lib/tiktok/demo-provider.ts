import type {
  AdsDataProvider,
  NormalizedDailyRow,
  ProviderFetchParams,
  ProviderRawRow,
} from "./contract";

/**
 * DemoTikTokDataProvider
 *
 * Generates realistic synthetic TikTok Ads data (campaign / ad group / ad, daily
 * metrics) using TikTok-API-like raw field names, so the normalization layer has
 * real mapping work and can later be swapped for a LiveTikTokDataProvider.
 *
 * One campaign per case, so the deterministic engine has a representative
 * example of every signal it can classify:
 *   cpa_deterioration, ctr_drop, creative_fatigue, scaling_efficiency,
 *   strong_improvement, stable, low_volume, tracking_issue, cpm_spike
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
    total_complete_payment_rate: string; // revenue (TikTok returns strings)
    reach: string;
    budget: string;
  };
};

export type DemoCase =
  | "cpa_deterioration"
  | "ctr_drop"
  | "creative_fatigue"
  | "scaling_efficiency"
  | "strong_improvement"
  | "stable"
  | "low_volume"
  | "tracking_issue"
  | "cpm_spike";

type CampaignSpec = {
  campaignId: string;
  campaignName: string;
  adsetName: string;
  adName: string;
  baseImpressions: number;
  baseCtr: number;
  baseCpc: number;
  baseCvr: number;
  aov: number;
  dailyBudget: number;
  demoCase: DemoCase;
};

const CAMPAIGNS: CampaignSpec[] = [
  {
    campaignId: "c_1001",
    campaignName: "Retargeting | Site Visitors 14d",
    adsetName: "ATC 14d",
    adName: "Offer — Free Shipping",
    baseImpressions: 96_000,
    baseCtr: 0.0231,
    baseCpc: 0.55,
    baseCvr: 0.061,
    aov: 71,
    dailyBudget: 620,
    demoCase: "cpa_deterioration",
  },
  {
    campaignId: "c_1002",
    campaignName: "Prospecting | Interest — Fitness",
    adsetName: "Interest 18-34",
    adName: "Studio Demo — 15s",
    baseImpressions: 180_000,
    baseCtr: 0.0142,
    baseCpc: 0.39,
    baseCvr: 0.028,
    aov: 58,
    dailyBudget: 760,
    demoCase: "ctr_drop",
  },
  {
    campaignId: "c_1003",
    campaignName: "Prospecting | Broad UGC",
    adsetName: "Broad 18-44",
    adName: "UGC Hook — Unboxing",
    baseImpressions: 210_000,
    baseCtr: 0.0155,
    baseCpc: 0.42,
    baseCvr: 0.031,
    aov: 62,
    dailyBudget: 900,
    demoCase: "creative_fatigue",
  },
  {
    campaignId: "c_1004",
    campaignName: "Scaling | Lookalike 3%",
    adsetName: "LAL 3% purchasers",
    adName: "Hero Ad — Social Proof",
    baseImpressions: 150_000,
    baseCtr: 0.0168,
    baseCpc: 0.44,
    baseCvr: 0.036,
    aov: 66,
    dailyBudget: 1400,
    demoCase: "scaling_efficiency",
  },
  {
    campaignId: "c_1005",
    campaignName: "Always-On | Catalog Sales",
    adsetName: "Catalog — Bestsellers",
    adName: "Dynamic Product Ad",
    baseImpressions: 128_000,
    baseCtr: 0.0161,
    baseCpc: 0.46,
    baseCvr: 0.034,
    aov: 64,
    dailyBudget: 700,
    demoCase: "strong_improvement",
  },
  {
    campaignId: "c_1006",
    campaignName: "Evergreen | Brand Search Defence",
    adsetName: "Brand keywords",
    adName: "Brand Explainer",
    baseImpressions: 88_000,
    baseCtr: 0.0189,
    baseCpc: 0.37,
    baseCvr: 0.045,
    aov: 60,
    dailyBudget: 480,
    demoCase: "stable",
  },
  {
    campaignId: "c_1007",
    campaignName: "Test | Spark Ads — Creator B",
    adsetName: "Creator test",
    adName: "Spark Ad — Creator B",
    baseImpressions: 2_400,
    baseCtr: 0.0176,
    baseCpc: 0.48,
    baseCvr: 0.029,
    aov: 59,
    dailyBudget: 40,
    demoCase: "low_volume",
  },
  {
    campaignId: "c_1008",
    campaignName: "Conversions | Checkout Push",
    adsetName: "Cart abandoners",
    adName: "Testimonial — Carousel",
    baseImpressions: 74_000,
    baseCtr: 0.0198,
    baseCpc: 0.51,
    baseCvr: 0.052,
    aov: 68,
    dailyBudget: 540,
    demoCase: "tracking_issue",
  },
  {
    campaignId: "c_1009",
    campaignName: "Reach | Seasonal Launch",
    adsetName: "Broad seasonal",
    adName: "Launch Teaser — 9s",
    baseImpressions: 240_000,
    baseCtr: 0.0134,
    baseCpc: 0.4,
    baseCvr: 0.026,
    aov: 61,
    dailyBudget: 820,
    demoCase: "cpm_spike",
  },
];

/** Deterministic pseudo-random so the same day+campaign always yields the same row. */
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

  /** Returns `days` complete days, ending with yesterday (never today). */
  async fetchDailyPerformance({ days }: ProviderFetchParams): Promise<TikTokRawRow[]> {
    const rows: TikTokRawRow[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);

    for (let offset = days - 1; offset >= 0; offset--) {
      const day = new Date(end);
      day.setUTCDate(end.getUTCDate() - offset);
      const date = isoDate(day);
      const dow = day.getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 0.9 : 1;
      for (const campaign of CAMPAIGNS) {
        rows.push(this.buildRow(campaign, date, offset, weekend));
      }
    }
    return rows;
  }

  /** `daysAgo` = 0 is the most recent complete day. 0-6 = current week, 7-13 = prior week. */
  private buildRow(
    spec: CampaignSpec,
    date: string,
    daysAgo: number,
    weekend: number,
  ): TikTokRawRow {
    const key = `${spec.campaignId}:${date}`;
    const recent = daysAgo <= 6;
    let impressions = spec.baseImpressions * weekend * jitter(`i${key}`, 0.09);
    let ctr = spec.baseCtr * jitter(`t${key}`, 0.06);
    let cpc = spec.baseCpc * jitter(`c${key}`, 0.05);
    let cvr = spec.baseCvr * jitter(`v${key}`, 0.07);
    let reachRatio = 1 / 1.35;
    let cpmMultiplier = 1;

    switch (spec.demoCase) {
      case "cpa_deterioration":
        if (recent) {
          cpc *= 1.45;
          cvr *= 0.82;
        }
        break;
      case "ctr_drop":
        if (recent) {
          ctr *= 0.76;
          cpc *= 1.08;
        }
        break;
      case "creative_fatigue":
        if (recent) {
          ctr *= 0.79;
          reachRatio = 1 / 1.85; // frequency climbs
          cpc *= 1.12;
        }
        break;
      case "scaling_efficiency":
        if (recent) {
          impressions *= 1.55; // budget scaled up, efficiency held
          cvr *= 1.03;
        }
        break;
      case "strong_improvement":
        if (recent) {
          ctr *= 1.18;
          cvr *= 1.34;
          cpc *= 0.94;
        }
        break;
      case "stable":
        break;
      case "low_volume":
        break;
      case "tracking_issue":
        if (daysAgo <= 4) cvr *= 0.08; // clicks intact, conversions collapse
        break;
      case "cpm_spike":
        if (recent) {
          cpmMultiplier = 1.42; // auction cost up, CTR flat
          cpc *= 1.42;
        }
        break;
    }

    const clicks = Math.max(1, Math.round(impressions * ctr));
    const budgetCeiling = spec.dailyBudget * (spec.demoCase === "scaling_efficiency" && recent ? 1.6 : 1);
    let spend = clicks * cpc * cpmMultiplier * jitter(`s${key}`, 0.03);
    if (spend > budgetCeiling) {
      const scale = budgetCeiling / spend;
      spend = budgetCeiling;
      impressions *= scale;
    }
    const conversions = Math.max(0, Math.round(clicks * cvr));
    const revenue = conversions * spec.aov * jitter(`r${key}`, 0.06);
    const reach = Math.max(1, Math.round(impressions * reachRatio));

    return {
      stat_time_day: `${date} 00:00:00`,
      campaign_id: spec.campaignId,
      campaign_name: spec.campaignName,
      adgroup_id: `${spec.campaignId}_ag`,
      adgroup_name: spec.adsetName,
      ad_id: `${spec.campaignId}_ad`,
      ad_name: spec.adName,
      metrics: {
        spend: spend.toFixed(2),
        impressions: String(Math.round(impressions)),
        clicks: String(clicks),
        conversions: String(conversions),
        total_complete_payment_rate: revenue.toFixed(2),
        reach: String(reach),
        budget: spec.dailyBudget.toFixed(2),
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
