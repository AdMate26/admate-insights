import { money } from "../format";
import { MEASURE_LABEL } from "../metrics/availability";
import { kpiLabel, OBJECTIVE_DEFS, RESULT_MEASURES, type KpiMode } from "../metrics/objectives";
import { performanceIndex } from "./goals";
import { advantage } from "./wording";
import type { Analysis, GoalStatus } from "./types";

type PartialAnalysis = Omit<Analysis, "findings" | "goalStatus" | "dataNotes" | "done" | "decisions">;

const fk = (v: number | null, mode: KpiMode, currency: string) => (v === null ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v, currency));

// How far the KPI is worse than the yardstick (0.24 = 24% worse; negative = better).
function worseBy(value: number, yard: number, mode: KpiMode): number {
  return mode === "roas" ? 1 - value / yard : value / yard - 1;
}

// "Am I OK?" per objective (docs/product-plan.md §6). With a target: on track
// (≤ 10% worse), off track (10–30%), far off (> 30% or below break-even).
// Without one: against the previous period, else within the account — and the
// text always says which yardstick was used. Nothing is judged against outside
// benchmarks.
export function computeGoalStatus(a: PartialAnalysis): GoalStatus[] {
  const cur = a.workspace.currency;
  const out: GoalStatus[] = [];
  for (const o of a.objectives) {
    if (o.b.spend <= 0) continue;
    const def = OBJECTIVE_DEFS[o.objective];
    const label = kpiLabel(o.objective, o.mode);
    const v = fk(o.kpiB, o.mode, cur);
    const base = { objective: o.objective, mode: o.mode, kpiLabel: label, value: o.kpiB, confidence: o.confidence };
    const suggest = !o.goal && o.kpiB !== null && o.mode !== "cpm" && !(o.objective === "sales" && o.mode === "cost") ? o.kpiB : null;

    if (o.kpiMissing || o.kpiB === null) {
      const missing = RESULT_MEASURES[o.objective].map((k) => MEASURE_LABEL[k]).join(" or ");
      out.push({
        ...base, basis: "none", state: "unknown", suggestedTarget: null,
        headline: o.kpiMissing
          ? `${def.label}: can't be judged — your export has no ${missing} column.`
          : `${def.label}: ${money(o.b.spend, cur)} spent and no ${def.resultLabel} recorded.`,
        detail: o.kpiMissing ? "Re-export with the Results column included." : null,
      });
      continue;
    }

    if (o.goal) {
      const w = worseBy(o.kpiB, o.goal.value, o.mode);
      const belowBreakEven = o.breakEven !== null && performanceIndex(o.kpiB, o.breakEven, o.mode)! < 1;
      const state = belowBreakEven || w > 0.3 ? "far_off" : w > 0.1 ? "off_track" : "on_track";
      const yard = o.goal.source === "target" ? "your target" : "break-even";
      const pi = performanceIndex(o.kpiB, o.goal.value, o.mode)!;
      const words = state === "on_track" ? "on track" : state === "off_track" ? "off track" : belowBreakEven ? "losing money" : "far off track";
      out.push({
        ...base, basis: o.goal.source === "target" ? "target" : "break_even", state, suggestedTarget: null,
        headline: `${def.label}: ${label} ${v} vs ${yard} ${fk(o.goal.value, o.mode, cur)} — ${words}.`,
        detail: Math.abs(pi - 1) >= 0.01 ? `${advantage(pi, o.mode).replace(/^./, (c) => c.toUpperCase())} than ${yard}.` : null,
      });
      continue;
    }

    if (o.change !== null && o.kpiA !== null) {
      const pi = performanceIndex(o.kpiB, o.kpiA, o.mode)!;
      const state = Math.abs(o.change) <= 0.03 ? "flat" : pi > 1 ? "better" : "worse";
      out.push({
        ...base, basis: "previous", state, suggestedTarget: suggest,
        headline:
          state === "flat"
            ? `${def.label}: ${label} ${v}, about the same as ${a.selection.compareLabel}.`
            : `${def.label}: ${label} ${v}, ${advantage(pi, o.mode)} than ${a.selection.compareLabel} (${fk(o.kpiA, o.mode, cur)}).`,
        detail: "No target set, so this compares with the previous period.",
      });
      continue;
    }

    const rows = a.campaigns.filter((r) => r.info.objective === o.objective && r.b.spend > 0 && r.kpiB !== null && r.mode === o.mode);
    if (rows.length >= 3) {
      const byPi = [...rows].sort((x, y) => performanceIndex(y.kpiB, o.kpiB, o.mode)! - performanceIndex(x.kpiB, o.kpiB, o.mode)!);
      const best = byPi[0];
      const worst = byPi[byPi.length - 1];
      out.push({
        ...base, basis: "within_account", state: "unknown", suggestedTarget: suggest,
        headline: `${def.label}: ${label} ${v} across ${rows.length} campaigns. Best: ${fk(best.kpiB, o.mode, cur)} (${best.info.name}); weakest: ${fk(worst.kpiB, o.mode, cur)} (${worst.info.name}).`,
        detail: "No target and no earlier period yet, so AdMate can only compare your campaigns with each other.",
      });
      continue;
    }

    out.push({
      ...base, basis: "none", state: "unknown", suggestedTarget: suggest,
      headline: `${def.label}: ${label} ${v} in ${a.selection.label}.`,
      detail: "Upload an earlier report or set a target so AdMate can judge performance.",
    });
  }
  return out;
}
