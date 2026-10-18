import type { Measures } from "../metrics/measures";
import { kpiValue, resultCount, type KpiMode, type Objective } from "../metrics/objectives";

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.3 };

// Standard normal CDF (Abramowitz–Stegun 7.1.26), accurate to ~1e-7.
function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Two-proportion z-test: did the rate x/n really change between A and B?
export function twoProportionP(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 1;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return p1 === p2 ? 1 : 0;
  const z = (p2 - p1) / se;
  return 2 * (1 - normCdf(Math.abs(z)));
}

function volumeLevel(objective: Objective, m: Measures, mode?: KpiMode): Confidence {
  if (objective === "awareness" || mode === "cpm") {
    return m.impressions >= 10_000 ? "high" : m.impressions >= 1_000 ? "medium" : "low";
  }
  const r = resultCount(m, objective);
  return r >= 20 ? "high" : r >= 10 ? "medium" : "low";
}

const lower = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCE_WEIGHT[a] <= CONFIDENCE_WEIGHT[b] ? a : b;

// Confidence that a KPI change between A and B is real (PRD §6 F6):
//  • minimum volume in both periods (≥20 results high, 10–19 medium, <10 low);
//  • the change must come from a significant result-rate change (z-test, p<0.05)
//    or mostly from CPM, which is measured on thousands of impressions.
// Raw (un-normalized) measures must be passed so counts are real counts.
export function changeConfidence(objective: Objective, mode: KpiMode, a: Measures, b: Measures): Confidence {
  const vol = lower(volumeLevel(objective, a, mode), volumeLevel(objective, b, mode));
  if (vol === "low") return "low";
  if (mode === "cpm") return vol; // CPM rests on thousands of impressions
  const ka = kpiValue(a, objective, mode);
  const kb = kpiValue(b, objective, mode);
  if (ka === null || kb === null || ka === 0) return "low";
  const p = twoProportionP(resultCount(a, objective), a.impressions, resultCount(b, objective), b.impressions);
  const cpmA = a.impressions > 0 ? a.spend / a.impressions : 0;
  const cpmB = b.impressions > 0 ? b.spend / b.impressions : 0;
  const kpiLog = Math.abs(Math.log(kb / ka));
  const cpmShare = cpmA > 0 && cpmB > 0 && kpiLog > 0 ? Math.abs(Math.log(cpmB / cpmA)) / kpiLog : 0;
  const enoughImpr = Math.min(a.impressions, b.impressions) >= 1_000;
  if (objective === "awareness") return vol;
  if (p < 0.05 || (cpmShare >= 0.5 && enoughImpr)) return vol;
  return vol === "high" ? "medium" : "low";
}

// Confidence of a single-period KPI level (no comparison available).
export function levelConfidence(objective: Objective, m: Measures, mode?: KpiMode): Confidence {
  return volumeLevel(objective, m, mode);
}
