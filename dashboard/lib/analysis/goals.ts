import { kpiPolarity, type KpiMode, type Objective } from "../metrics/objectives";

// Performance index: > 1 means better than the yardstick, whatever the polarity.
export function performanceIndex(value: number | null, yardstick: number | null, mode: KpiMode): number | null {
  if (value === null || yardstick === null || value <= 0 || yardstick <= 0) return null;
  return kpiPolarity(mode) === "lower" ? yardstick / value : value / yardstick;
}

export interface Goal {
  objective: Objective;
  target: number | null;
  marginPct: number | null;
  leadToCustomerPct: number | null;
  profitPerCustomer: number | null;
}

export interface Yardstick {
  value: number;
  source: "target" | "break_even";
}

// Break-even point from the optional profit inputs (PRD F2):
//   sales (ROAS)        → 1 / margin
//   leads / messages    → close rate × gross profit per customer = max profitable cost per result
export function breakEven(goal: Goal | undefined, mode: KpiMode): number | null {
  if (!goal) return null;
  if (goal.objective === "sales" && mode === "roas" && goal.marginPct && goal.marginPct > 0) {
    return 1 / (goal.marginPct / 100);
  }
  if ((goal.objective === "leads" || goal.objective === "messages") && goal.leadToCustomerPct && goal.profitPerCustomer) {
    return (goal.leadToCustomerPct / 100) * goal.profitPerCustomer;
  }
  return null;
}

// Goal yardstick: the user's target first, otherwise break-even.
export function goalYardstick(goal: Goal | undefined, mode: KpiMode): Yardstick | null {
  // An awareness target is a cost per 1K reached; it can't judge CPM.
  if (mode === "cpm") return null;
  // A sales target is a ROAS; it can't judge campaigns that report no revenue.
  if (goal?.objective === "sales" && mode === "cost") return null;
  if (goal?.target && goal.target > 0) return { value: goal.target, source: "target" };
  const be = breakEven(goal, mode);
  return be ? { value: be, source: "break_even" } : null;
}

// Value of one extra result, used to put a $ figure on opportunities.
export function valuePerResult(goal: Goal | undefined, mode: KpiMode): number | null {
  if (!goal) return null;
  if ((goal.objective === "leads" || goal.objective === "messages") && goal.leadToCustomerPct && goal.profitPerCustomer) {
    return (goal.leadToCustomerPct / 100) * goal.profitPerCustomer;
  }
  if (mode === "cost" && goal.target && goal.objective !== "sales") return goal.target;
  return null;
}
