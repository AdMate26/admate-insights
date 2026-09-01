import type { AdsDataProvider, NormalizedDailyRow, ProviderRawRow } from "./contract";

/**
 * Normalization layer: the ONLY place that knows a provider's raw shape.
 * Downstream code consumes `NormalizedDailyRow` exclusively.
 */
export async function loadNormalizedDailyRows<TRaw extends ProviderRawRow>(
  provider: AdsDataProvider<TRaw>,
  days: number,
): Promise<NormalizedDailyRow[]> {
  const raw = await provider.fetchDailyPerformance({ days });
  return raw
    .map((row) => provider.normalizeRow(row))
    .filter((row) => Boolean(row.date) && Number.isFinite(row.spend))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type { NormalizedDailyRow };
