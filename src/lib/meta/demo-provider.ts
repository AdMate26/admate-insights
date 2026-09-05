import type {
  AdsDataProvider,
  NormalizedDailyRow,
  ProviderFetchParams,
  ProviderRawRow,
} from "../tiktok/contract";

/**
 * DemoMetaDataProvider
 *
 * Synthetic Meta Ads data (campaign / ad set / ad, daily metrics) using
 * Meta-style raw field names. Six campaigns, each engineered so the Meta
 * ANALYZER derives one representative finding from the generated metrics — the
 * scenario is NOT hard-coded onto the campaign; it emerges from the numbers:
 *   creative fatigue, cost-per-result deterioration, strong improvement,
 *   CPM/delivery-cost pressure, possible tracking issue, early/insufficient data.
 */

type MetaRawRow = {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string; // link clicks
  results: string; // conversions
  purchase_value: string; // revenue
  daily_budget: string;
  campaign_start_date: string | null;
  campaign_end_date: string | null;
};

type MetaCase =
  | "creative_fatigue"
  | "cost_per_result"
  | "strong_improvement"
  | "delivery_cost"
  | "tracking_issue"
  | "early_data";

type Spec = {
  campaignId: string;
  campaignName: string;
  adsetName: string;
  adName: string;
  baseImpressions: number;
  baseCtr: number;
  baseCpc: number;
  baseCvr: number;
  baseFrequency: number;
  aov: number;
  dailyBudget: number;
  metaCase: MetaCase;
  startOffsetDays: number;
  endOffsetDays: number | null;
};

const CAMPAIGNS: Spec[] = [
  {
    campaignId: "m_2001",
    campaignName: "Prospecting | Advantage+ Broad",
    adsetName: "Advantage+ audience",
    adName: "UGC Reel — Testimonial",
    baseImpressions: 220_000,
    baseCtr: 0.0125,
    baseCpc: 0.82,
    baseCvr: 0.032,
    baseFrequency: 2.0,
    aov: 64,
    dailyBudget: 3000,
    metaCase: "creative_fatigue",
    startOffsetDays: 40,
    endOffsetDays: null,
  },
  {
    campaignId: "m_2002",
    campaignName: "Retargeting | 30d Site Visitors",
    adsetName: "Site visitors 30d",
    adName: "Carousel — Bestsellers",
    baseImpressions: 90_000,
    baseCtr: 0.019,
    baseCpc: 0.7,
    baseCvr: 0.055,
    baseFrequency: 2.4,
    aov: 70,
    dailyBudget: 1600,
    metaCase: "cost_per_result",
    startOffsetDays: 30,
    endOffsetDays: 12,
  },
  {
    campaignId: "m_2003",
    campaignName: "Prospecting | Lookalike 2%",
    adsetName: "LAL 2% purchasers",
    adName: "Founder Story — 30s",
    baseImpressions: 160_000,
    baseCtr: 0.0138,
    baseCpc: 0.75,
    baseCvr: 0.036,
    baseFrequency: 1.9,
    aov: 66,
    dailyBudget: 2200,
    metaCase: "strong_improvement",
    startOffsetDays: 26,
    endOffsetDays: null,
  },
  {
    campaignId: "m_2004",
    campaignName: "Always-On | Catalog Sales",
    adsetName: "Catalog — DPA",
    adName: "Dynamic Product Ad",
    baseImpressions: 140_000,
    baseCtr: 0.0152,
    baseCpc: 0.78,
    baseCvr: 0.041,
    baseFrequency: 2.1,
    aov: 62,
    dailyBudget: 2600,
    metaCase: "delivery_cost",
    startOffsetDays: 55,
    endOffsetDays: null,
  },
  {
    campaignId: "m_2005",
    campaignName: "Conversions | Checkout Abandoners",
    adsetName: "IC-not-purchase 7d",
    adName: "Reminder — Free Returns",
    baseImpressions: 78_000,
    baseCtr: 0.021,
    baseCpc: 0.72,
    baseCvr: 0.06,
    baseFrequency: 2.2,
    aov: 69,
    dailyBudget: 1600,
    metaCase: "tracking_issue",
    startOffsetDays: 48,
    endOffsetDays: null,
  },
  {
    campaignId: "m_2006",
    campaignName: "Test | New Creator Angle",
    adsetName: "Broad test",
    adName: "Creator Hook — 12s",
    baseImpressions: 2_600,
    baseCtr: 0.0122,
    baseCpc: 0.85,
    baseCvr: 0.03,
    baseFrequency: 1.5,
    aov: 58,
    dailyBudget: 45,
    metaCase: "early_data",
    startOffsetDays: 4,
    endOffsetDays: null,
  },
];

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

function offsetDate(deltaDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return isoDate(d);
}

export class DemoMetaDataProvider implements AdsDataProvider<MetaRawRow> {
  readonly id = "meta-demo";
  readonly label = "Demo Meta Ads (synthetic)";

  async fetchDailyPerformance({ days }: ProviderFetchParams): Promise<MetaRawRow[]> {
    const rows: MetaRawRow[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);
    for (let offset = days - 1; offset >= 0; offset--) {
      const day = new Date(end);
      day.setUTCDate(end.getUTCDate() - offset);
      const date = isoDate(day);
      const dow = day.getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 0.92 : 1;
      for (const spec of CAMPAIGNS) rows.push(this.buildRow(spec, date, offset, weekend));
    }
    return rows;
  }

  private buildRow(spec: Spec, date: string, daysAgo: number, weekend: number): MetaRawRow {
    const key = `${spec.campaignId}:${date}`;
    const recent = daysAgo <= 6;
    let impressions = spec.baseImpressions * weekend * jitter(`i${key}`, 0.08);
    let ctr = spec.baseCtr * jitter(`t${key}`, 0.05);
    let cpc = spec.baseCpc * jitter(`c${key}`, 0.05);
    let cvr = spec.baseCvr * jitter(`v${key}`, 0.06);
    let frequency = spec.baseFrequency * jitter(`f${key}`, 0.03);

    switch (spec.metaCase) {
      case "creative_fatigue":
        if (recent) {
          frequency *= 1.2; // audience saturating
          ctr *= 0.85; // response falling
          cpc *= 1.08; // costs drifting up
        }
        break;
      case "cost_per_result":
        if (recent) {
          cvr *= 0.78; // conversion rate weakening (CPM/CPC held)
        }
        break;
      case "strong_improvement":
        if (recent) {
          cvr *= 1.32;
          cpc *= 0.94;
        }
        break;
      case "delivery_cost":
        if (recent) {
          cpc *= 1.28; // auction/delivery cost pressure, CVR/CTR held → CPM up
        }
        break;
      case "tracking_issue":
        if (daysAgo <= 4) cvr *= 0.1; // results collapse, clicks intact
        break;
      case "early_data":
        break;
    }

    const clicks = Math.max(1, Math.round(impressions * ctr));
    const spend = clicks * cpc * jitter(`s${key}`, 0.03);
    const conversions = Math.max(0, Math.round(clicks * cvr));
    const revenue = conversions * spec.aov * jitter(`r${key}`, 0.05);
    const reach = Math.max(1, Math.round(impressions / Math.max(1, frequency)));

    return {
      date_start: date,
      campaign_id: spec.campaignId,
      campaign_name: spec.campaignName,
      adset_name: spec.adsetName,
      ad_name: spec.adName,
      spend: spend.toFixed(2),
      impressions: String(Math.round(impressions)),
      reach: String(reach),
      clicks: String(clicks),
      results: String(conversions),
      purchase_value: revenue.toFixed(2),
      daily_budget: spec.dailyBudget.toFixed(2),
      campaign_start_date: offsetDate(-spec.startOffsetDays),
      campaign_end_date: spec.endOffsetDays == null ? null : offsetDate(spec.endOffsetDays),
    };
  }

  normalizeRow(raw: MetaRawRow): NormalizedDailyRow {
    return {
      date: raw.date_start,
      campaignId: raw.campaign_id,
      campaignName: raw.campaign_name,
      adsetId: `${raw.campaign_id}_as`,
      adsetName: raw.adset_name,
      adId: `${raw.campaign_id}_ad`,
      adName: raw.ad_name,
      spend: Number(raw.spend),
      impressions: Number(raw.impressions),
      clicks: Number(raw.clicks),
      conversions: Number(raw.results),
      revenue: Number(raw.purchase_value),
      reach: Number(raw.reach),
      dailyBudget: Number(raw.daily_budget),
      campaignStartDate: raw.campaign_start_date,
      campaignEndDate: raw.campaign_end_date,
      platform: "meta",
    };
  }
}

export type { ProviderRawRow };
