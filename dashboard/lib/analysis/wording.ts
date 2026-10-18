import type { KpiMode } from "../metrics/objectives";

// How much better (pi > 1) or worse (pi < 1) something is, in words that match
// the KPI: costs are "cheaper" / "more expensive", ROAS is "higher" / "lower".
// pi is a performance index: yardstick ÷ value for costs, value ÷ yardstick for ROAS.
//   cost per 1K reached $0.15 vs $0.462 → pi 3.08 → "68% cheaper" (not "208% better")
export function advantage(pi: number, mode: KpiMode): string {
  if (mode === "roas") {
    return pi >= 1 ? `${Math.round((pi - 1) * 100)}% higher` : `${Math.round((1 - pi) * 100)}% lower`;
  }
  return pi >= 1 ? `${Math.round((1 - 1 / pi) * 100)}% cheaper` : `${Math.round((1 / pi - 1) * 100)}% more expensive`;
}
