import { money, num, signedPct } from "../format";
import { OBJECTIVE_DEFS, kpiLabel, resultCount } from "../metrics/objectives";
import { computePlan } from "./plan";
import type { Analysis } from "./types";

// "Summary report": the same six parts every time, built only
// from engine numbers. The AI may reword it (lib/ai/narrate.ts) but can't add numbers.
export interface ManagerSummaryFacts {
  title: string;
  headline: string;
  changes: string[];
  working: string | null;
  doing: string[];
  next: string[];
  caveats: string[];
}

export function managerSummaryFacts(a: Analysis): ManagerSummaryFacts {
  const cur = a.workspace.currency;
  const cmp = a.hasComparisonData ? ` vs ${a.selection.compareLabel}` : "";
  const objs = a.objectives.filter((o) => o.b.spend > 0);
  const main = objs[0];
  const mainGoal = main ? a.goalStatus.find((g) => g.objective === main.objective) : undefined;
  const todo = a.findings.filter((f) => f.status === "todo");
  const attention = todo.filter((f) => f.bucket === "attention");
  const opp = todo.find((f) => f.bucket === "opportunity");

  const spendLine = `${money(a.totals.spendB, cur)} spent in ${a.selection.label}${a.totals.change !== null && Math.abs(a.totals.change) >= 0.02 ? ` (${signedPct(a.totals.change)}${cmp})` : ""}`;
  const headline = mainGoal ? `${spendLine}. ${mainGoal.headline}` : `${spendLine}.`;

  const changes: string[] = [];
  for (const o of objs.slice(0, 3)) {
    if (o.kpiMissing || o.kpiB === null) continue;
    const def = OBJECTIVE_DEFS[o.objective];
    const fk = (v: number) => (o.mode === "roas" ? `${v.toFixed(2)}×` : money(v, cur));
    const res = o.mode === "cpm" ? "" : `${num(resultCount(o.b, o.objective), true)} ${def.resultLabel}, `;
    changes.push(
      o.change !== null && o.kpiA !== null
        ? `${def.label}: ${res}${kpiLabel(o.objective, o.mode)} ${fk(o.kpiB)} (${signedPct(o.change)} from ${fk(o.kpiA)})${o.confidence === "low" ? " — early signal, little data" : ""}.`
        : `${def.label}: ${res}${kpiLabel(o.objective, o.mode)} ${fk(o.kpiB)}.`,
    );
  }
  for (const f of attention.slice(0, 2)) changes.push(f.whatHappened);

  const doing = [
    ...a.done.slice(0, 3).map((d) => `Done: ${d.title}. ${d.outcome.text}`),
    // The high-priority step for each campaign (the same plan as on Recommendations).
    ...computePlan(a)
      .filter((x) => x.priority === "high")
      .slice(0, 4)
      .map((x) => `${x.row.info.name}: ${x.label.toLowerCase()} — ${x.action.split(/(?<=\.)\s/)[0]}`),
  ];
  const next = attention.slice(0, 3).map((f) => `${f.title} — re-check in ${f.recheckDays} day${f.recheckDays === 1 ? "" : "s"}: ${f.recheckRule}`);
  const caveats = [
    ...a.dataNotes.filter((n) => n.level === "warn").map((n) => n.text),
    ...(objs.some((o) => o.confidence === "low") ? ["Some changes rest on little data, so they are early signals rather than firm conclusions."] : []),
  ];
  return {
    title: `${a.workspace.name} — ads update, ${a.selection.label}${cmp}`,
    headline,
    changes,
    working: opp ? opp.whatHappened : null,
    doing,
    next,
    caveats,
  };
}

// Plain-text version (also the fallback when AI is off or its text fails the number check).
export function managerSummaryText(f: ManagerSummaryFacts): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const parts = [
    f.title,
    "",
    `Headline: ${f.headline}`,
    "",
    "What changed:",
    list(f.changes.length ? f.changes : ["No comparable earlier period yet."]),
    "",
    `What's working: ${f.working ?? "Nothing stands out as a clear winner this period."}`,
    "",
    "What I'm doing about it:",
    list(f.doing.length ? f.doing : ["Nothing needs changing right now; keep monitoring."]),
  ];
  if (f.next.length) parts.push("", "Next:", list(f.next));
  if (f.caveats.length) parts.push("", "Caveats:", list(f.caveats));
  return parts.join("\n");
}
