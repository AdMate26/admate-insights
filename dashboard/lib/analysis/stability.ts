import { emptyMeasures, MEASURE_KEYS, type Measures } from "../metrics/measures";
import { kpiValue, resultCount, type KpiMode, type Objective } from "../metrics/objectives";
import { performanceIndex } from "./goals";
import { twoProportionP } from "./stats";

// When is a change real enough to act on? (docs/AdMate_MRD.md §16.3, AR-3–AR-5)
//
// One definition of "x% better / worse", the same one the cards print
// (wording.ts): for costs, "20% cheaper" means the cost fell by 20%; for ROAS,
// "20% higher" means ROAS rose by 20%. The threshold is symmetric.
//
// A budget call ("put more money in" / "cut") is confirmed in one of two ways:
//   • sudden and strong: significant vs the previous period AND very clear
//     (p < STRONG_ALPHA) vs the item's older history;
//   • held two periods: this period and the previous one both differ from the
//     older history in the same direction, each significantly.
// Anything else is an early signal ("watch"), so normal week-to-week noise
// doesn't turn into budget advice.

export const CHANGE_AT = 0.2;
export const ALPHA = 0.05;
export const STRONG_ALPHA = 0.01;

// Conversions keep arriving for days after a click, so the most recent days of an
// export under-count them. Days that ended less than this many days before the
// report was uploaded are "immature" for conversion objectives (MRD FR-04).
export const MATURITY_DAYS = 3;

// How much better the value is than the yardstick, as the cards word it (0.25 = 25% better).
export function betterBy(pi: number, mode: KpiMode): number {
  return mode === "roas" ? pi - 1 : 1 - 1 / pi;
}

// How much worse, as the cards word it (0.25 = 25% more expensive / 25% lower ROAS).
export function worseBy(pi: number, mode: KpiMode): number {
  return mode === "roas" ? 1 - pi : 1 / pi - 1;
}

export type Direction = "better" | "worse";

export function direction(pi: number | null, mode: KpiMode, at = CHANGE_AT): Direction | null {
  if (pi === null) return null;
  if (betterBy(pi, mode) >= at - 1e-9) return "better";
  if (worseBy(pi, mode) >= at - 1e-9) return "worse";
  return null;
}

// Did the KPI really change between two sets of raw counts? The result rate
// must differ significantly (two-proportion test), or the change must come
// mostly from CPM, which rests on thousands of impressions.
export function significant(objective: Objective, mode: KpiMode, base: Measures, b: Measures, alpha = ALPHA): boolean {
  const enoughImpr = Math.min(base.impressions, b.impressions) >= 1_000;
  const cpmA = base.impressions > 0 ? base.spend / base.impressions : 0;
  const cpmB = b.impressions > 0 ? b.spend / b.impressions : 0;
  if (mode === "cpm") return enoughImpr && cpmA > 0 && cpmB > 0;
  const ka = kpiValue(base, objective, mode);
  const kb = kpiValue(b, objective, mode);
  if (ka === null || kb === null || ka <= 0 || kb <= 0) return false;
  const p = twoProportionP(resultCount(base, objective), base.impressions, resultCount(b, objective), b.impressions);
  if (p < alpha) return true;
  const kpiLog = Math.abs(Math.log(kb / ka));
  const cpmShare = cpmA > 0 && cpmB > 0 && kpiLog > 0 ? Math.abs(Math.log(cpmB / cpmA)) / kpiLog : 0;
  return cpmShare >= 0.5 && enoughImpr;
}

// The change from `base` to `b` is at least the threshold in direction `dir`, and real.
export function holds(objective: Objective, mode: KpiMode, base: Measures, b: Measures, dir: Direction, alpha = ALPHA): boolean {
  const pi = performanceIndex(kpiValue(b, objective, mode), kpiValue(base, objective, mode), mode);
  return direction(pi, mode) === dir && significant(objective, mode, base, b, alpha);
}

// Clearly worse than a fixed line such as break-even, not just below it by
// chance: given the spend, the line implies an expected number of results
// (for ROAS, at the observed order value); the observed count must fall short
// of it beyond normal counting noise (one-sided, z ≤ −1.645 ≈ 95%).
export function clearlyWorseThan(objective: Objective, mode: KpiMode, m: Measures, line: number): boolean {
  const results = resultCount(m, objective);
  if (line <= 0 || m.spend <= 0) return false;
  let expected: number;
  if (mode === "roas") {
    if (results <= 0) return m.spend * line > 0; // spend with no sales is below any break-even
    const aov = m.conversionValue / results;
    if (aov <= 0) return false;
    expected = (line * m.spend) / aov;
  } else if (mode === "cost") {
    expected = m.spend / line;
  } else return false;
  if (expected <= 0) return false;
  return (results - expected) / Math.sqrt(expected) <= -1.645;
}

// `whole` minus `part` (e.g. all past data minus the previous period = the older history).
export function minus(whole: Measures, part: Measures): Measures {
  const out = emptyMeasures();
  for (const k of MEASURE_KEYS) out[k] = Math.max(0, whole[k] - part[k]);
  return out;
}
