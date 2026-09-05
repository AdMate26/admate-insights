import type {
  AdsDataProvider,
  NormalizedDailyRow,
  ProviderFetchParams,
  ProviderRawRow,
} from "../tiktok/contract";

/**
 * DemoGoogleSearchDataProvider
 *
 * Synthetic Google Ads — Search data. Four campaigns, each engineered so the
 * Google Search ANALYZER derives one representative finding from the generated
 * metrics (not hard-coded):
 *   CPA deterioration / rising CPC, lost visibility (budget/rank limitation),
 *   CTR / search-relevance weakness, strong conversion-value / ROAS improvement.
 *
 * Search-specific fields include impression share and the share lost to budget
 * and to Ad Rank. Quality Score is intentionally NOT modelled as a score input.
 */

type GoogleRawRow = {
  date: string;
  campaign_id: string;
  campaign_name: string;
  ad_group: string;
  cost: string;
  impressions: string;
  clicks: string;
  conversions: string;
  conversions_value: string;
  search_impression_share: string; // 0..1
  search_lost_is_budget: string; // 0..1
  search_lost_is_rank: string; // 0..1
  daily_budget: string;
  campaign_start_date: string | null;
  campaign_end_date: string | null;
};

type GoogleCase = "cpa_rising_cpc" | "lost_visibility" | "relevance_weak" | "value_improvement";

type Spec = {
  campaignId: string;
  campaignName: string;
  adGroup: string;
  baseImpressions: number;
  baseCtr: number;
  baseCpc: number;
  baseCvr: number;
  aov: number;
  dailyBudget: number;
  baseIs: number;
  baseLostBudget: number;
  baseLostRank: number;
  googleCase: GoogleCase;
  startOffsetDays: number;
  endOffsetDays: number | null;
};

const CAMPAIGNS: Spec[] = [
  {
    campaignId: "g_3001",
    campaignName: "Search | Brand + Competitor",
    adGroup: "Competitor terms",
    baseImpressions: 28_000,
    baseCtr: 0.062,
    baseCpc: 2.3,
    baseCvr: 0.05,
    aov: 120,
    dailyBudget: 7000,
    baseIs: 0.74,
    baseLostBudget: 0.06,
    baseLostRank: 0.2,
    googleCase: "cpa_rising_cpc",
    startOffsetDays: 40,
    endOffsetDays: null,
  },
  {
    campaignId: "g_3002",
    campaignName: "Search | Non-Brand High-Intent",
    adGroup: "Category exact",
    baseImpressions: 34_000,
    baseCtr: 0.058,
    baseCpc: 2.1,
    baseCvr: 0.048,
    aov: 115,
    dailyBudget: 6000,
    baseIs: 0.72,
    baseLostBudget: 0.1,
    baseLostRank: 0.18,
    googleCase: "lost_visibility",
    startOffsetDays: 30,
    endOffsetDays: 20,
  },
  {
    campaignId: "g_3003",
    campaignName: "Search | Broad Discovery",
    adGroup: "Broad match + smart bidding",
    baseImpressions: 42_000,
    baseCtr: 0.05,
    baseCpc: 1.8,
    baseCvr: 0.042,
    aov: 110,
    dailyBudget: 6000,
    baseIs: 0.66,
    baseLostBudget: 0.08,
    baseLostRank: 0.26,
    googleCase: "relevance_weak",
    startOffsetDays: 22,
    endOffsetDays: null,
  },
  {
    campaignId: "g_3004",
    campaignName: "Search | Best Sellers (Value)",
    adGroup: "Product terms",
    baseImpressions: 30_000,
    baseCtr: 0.06,
    baseCpc: 2.0,
    baseCvr: 0.052,
    aov: 125,
    dailyBudget: 6000,
    baseIs: 0.78,
    baseLostBudget: 0.05,
    baseLostRank: 0.17,
    googleCase: "value_improvement",
    startOffsetDays: 34,
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

export class DemoGoogleSearchDataProvider implements AdsDataProvider<GoogleRawRow> {
  readonly id = "google-search-demo";
  readonly label = "Demo Google Search Ads (synthetic)";

  async fetchDailyPerformance({ days }: ProviderFetchParams): Promise<GoogleRawRow[]> {
    const rows: GoogleRawRow[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);
    for (let offset = days - 1; offset >= 0; offset--) {
      const day = new Date(end);
      day.setUTCDate(end.getUTCDate() - offset);
      const date = isoDate(day);
      const dow = day.getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 0.9 : 1;
      for (const spec of CAMPAIGNS) rows.push(this.buildRow(spec, date, offset, weekend));
    }
    return rows;
  }

  private buildRow(spec: Spec, date: string, daysAgo: number, weekend: number): GoogleRawRow {
    const key = `${spec.campaignId}:${date}`;
    const recent = daysAgo <= 6;
    let impressions = spec.baseImpressions * weekend * jitter(`i${key}`, 0.07);
    let ctr = spec.baseCtr * jitter(`t${key}`, 0.05);
    let cpc = spec.baseCpc * jitter(`c${key}`, 0.05);
    let cvr = spec.baseCvr * jitter(`v${key}`, 0.06);
    let valueMult = 1;
    let is = spec.baseIs * jitter(`is${key}`, 0.02);
    let lostBudget = spec.baseLostBudget;
    let lostRank = spec.baseLostRank;

    switch (spec.googleCase) {
      case "cpa_rising_cpc":
        if (recent) cpc *= 1.3; // auction price competition lifts CPC → CPA
        break;
      case "lost_visibility":
        if (recent) {
          impressions *= 0.7; // budget cap throttles delivery
          is *= 0.68; // impression share collapses
          lostBudget = 0.34; // most loss is budget-driven
          lostRank = 0.16;
        }
        break;
      case "relevance_weak":
        if (recent) {
          ctr *= 0.8; // weaker query/ad relevance
          cpc *= 1.06;
        }
        break;
      case "value_improvement":
        if (recent) {
          valueMult = 1.25; // higher-value conversions
          cpc *= 0.95;
        }
        break;
    }

    const clicks = Math.max(1, Math.round(impressions * ctr));
    const cost = clicks * cpc * jitter(`s${key}`, 0.03);
    const conversions = Math.max(0, Math.round(clicks * cvr));
    const convValue = conversions * spec.aov * valueMult * jitter(`r${key}`, 0.05);
    const isClamped = Math.max(0.02, Math.min(0.98, is));

    return {
      date,
      campaign_id: spec.campaignId,
      campaign_name: spec.campaignName,
      ad_group: spec.adGroup,
      cost: cost.toFixed(2),
      impressions: String(Math.round(impressions)),
      clicks: String(clicks),
      conversions: String(conversions),
      conversions_value: convValue.toFixed(2),
      search_impression_share: isClamped.toFixed(4),
      search_lost_is_budget: lostBudget.toFixed(4),
      search_lost_is_rank: lostRank.toFixed(4),
      daily_budget: spec.dailyBudget.toFixed(2),
      campaign_start_date: offsetDate(-spec.startOffsetDays),
      campaign_end_date: spec.endOffsetDays == null ? null : offsetDate(spec.endOffsetDays),
    };
  }

  normalizeRow(raw: GoogleRawRow): NormalizedDailyRow {
    const impressions = Number(raw.impressions);
    return {
      date: raw.date,
      campaignId: raw.campaign_id,
      campaignName: raw.campaign_name,
      adsetId: `${raw.campaign_id}_ag`,
      adsetName: raw.ad_group,
      adId: `${raw.campaign_id}_ad`,
      adName: raw.ad_group,
      spend: Number(raw.cost),
      impressions,
      clicks: Number(raw.clicks),
      conversions: Number(raw.conversions),
      revenue: Number(raw.conversions_value),
      // Search has no reach/frequency concept; use impressions so frequency ≈ 1.
      reach: impressions,
      dailyBudget: Number(raw.daily_budget),
      campaignStartDate: raw.campaign_start_date,
      campaignEndDate: raw.campaign_end_date,
      platform: "google_search",
      searchImpressionShare: Number(raw.search_impression_share),
      searchLostIsBudget: Number(raw.search_lost_is_budget),
      searchLostIsRank: Number(raw.search_lost_is_rank),
    };
  }
}

export type { ProviderRawRow };
