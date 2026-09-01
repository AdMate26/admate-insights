/**
 * Data provider contract.
 *
 * Everything downstream (normalization, analysis engine, AI layer, UI) depends
 * ONLY on this contract — never on a provider's raw payload shape. A future
 * `LiveTikTokDataProvider` (real TikTok Ads API) implements the same interface
 * and returns its own raw rows plus a normalizer mapping, so no downstream code
 * changes.
 */

/** Provider-agnostic raw row: whatever shape the provider natively returns. */
export type ProviderRawRow = Record<string, unknown>;

export type ProviderFetchParams = {
  /** Inclusive number of days of daily data to return, ending yesterday. */
  days: number;
};

export interface AdsDataProvider<TRaw extends ProviderRawRow = ProviderRawRow> {
  readonly id: string;
  readonly label: string;
  fetchDailyPerformance(params: ProviderFetchParams): Promise<TRaw[]>;
  /** Maps a raw provider row into the internal schema. */
  normalizeRow(raw: TRaw): NormalizedDailyRow;
}

/** The one internal schema the whole app speaks. */
export type NormalizedDailyRow = {
  date: string; // YYYY-MM-DD
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  reach: number;
  dailyBudget: number;
};
