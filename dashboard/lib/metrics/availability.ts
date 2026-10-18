import { MEASURE_KEYS, type MeasureKey, type Measures } from "./measures";
import { RESULT_MEASURES, type KpiMode, type Objective } from "./objectives";

// Which measures a set of numbers can be trusted for. A measure is missing when
// the export had no such column, or (reach only) when adding rows up would give
// a wrong number: reach counts unique people, so the reach of 7 days or of 4 ads
// is NOT the sum of their reaches.
export type Avail = ReadonlySet<MeasureKey>;

export const ALL_MEASURES: Avail = new Set(MEASURE_KEYS);

// Measures available in every one of the sets (an aggregate is only as complete
// as its least complete part). No sets = nothing known to be missing.
export function intersectAvail(sets: Avail[]): Set<MeasureKey> {
  if (sets.length === 0) return new Set(ALL_MEASURES);
  return new Set(MEASURE_KEYS.filter((k) => sets.every((s) => s.has(k))));
}

export function withoutReach(avail: Avail): Set<MeasureKey> {
  const out = new Set(avail);
  out.delete("reach");
  return out;
}

export function resultAvailable(avail: Avail, objective: Objective): boolean {
  return RESULT_MEASURES[objective].some((k) => avail.has(k));
}

// Human name of what is missing, for "not in your export" messages.
export const MEASURE_LABEL: Record<MeasureKey, string> = {
  spend: "amount spent",
  impressions: "impressions",
  reach: "reach",
  clicksAll: "clicks",
  linkClicks: "link clicks",
  landingPageViews: "landing page views",
  engagements: "engagements",
  follows: "follows",
  videoViews: "video views",
  thruplays: "ThruPlays",
  leads: "leads",
  messages: "conversations",
  installs: "installs",
  registrations: "registrations",
  purchases: "purchases",
  conversions: "conversions",
  conversionValue: "conversion value (revenue)",
  leadFormOpens: "lead form opens",
};

// KPI mode for a row given what its numbers can support (see KpiMode).
export function chooseMode(objective: Objective, b: Measures, a: Measures | null, availB: Avail, availA: Avail | null): KpiMode {
  if (objective === "sales") {
    const revenue = availB.has("conversionValue") && (b.conversionValue > 0 || (a?.conversionValue ?? 0) > 0);
    return revenue ? "roas" : "cost";
  }
  if (objective === "awareness") {
    const reachOk = availB.has("reach") && (!a || !availA || availA.has("reach"));
    return reachOk ? "cost" : "cpm";
  }
  return "cost";
}

// The KPI can be computed from these numbers (its inputs are in the export).
export function kpiAvailable(objective: Objective, mode: KpiMode, avail: Avail): boolean {
  if (mode === "cpm") return avail.has("impressions");
  if (mode === "roas") return avail.has("conversionValue");
  return resultAvailable(avail, objective);
}
