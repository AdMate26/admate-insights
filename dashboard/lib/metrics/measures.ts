// Canonical additive measures. Every platform export is normalized into these;
// every ratio metric is recomputed from them (never averaged across rows).

export const MEASURE_KEYS = [
  "spend",
  "impressions",
  "reach",
  "clicksAll",
  "linkClicks",
  "landingPageViews",
  "engagements",
  "follows",
  "videoViews",
  "thruplays",
  "leads",
  "messages",
  "installs",
  "registrations", // in-app sign-ups ("complete registration" app events)
  "purchases",
  "conversions",
  "conversionValue",
  "leadFormOpens",
] as const;

export type MeasureKey = (typeof MEASURE_KEYS)[number];
export type Measures = Record<MeasureKey, number>;

export function emptyMeasures(): Measures {
  return Object.fromEntries(MEASURE_KEYS.map((k) => [k, 0])) as Measures;
}

export function addMeasures(into: Measures, add: Partial<Measures>): Measures {
  for (const k of MEASURE_KEYS) into[k] += add[k] ?? 0;
  return into;
}

export function sumMeasures(list: Partial<Measures>[]): Measures {
  const total = emptyMeasures();
  for (const m of list) addMeasures(total, m);
  return total;
}

export function scaleMeasures(m: Measures, factor: number): Measures {
  const out = emptyMeasures();
  for (const k of MEASURE_KEYS) out[k] = m[k] * factor;
  return out;
}
