import { createHash } from "node:crypto";
import { money, num, pct, signedPct } from "../format";
import { OBJECTIVE_DEFS, kpiLabel, resultCount, type KpiMode } from "../metrics/objectives";
import { mainDriver, type Driver } from "./decompose";
import type { Analysis } from "./types";

// Verified facts handed to the summary writer (template or Claude). Every
// number the summary may state must be present here, pre-formatted.
export interface NarrativeFacts {
  account: string;
  period: string;
  comparePeriod: string | null;
  spend: string;
  spendChange: string | null;
  objectives: {
    objective: string;
    kpi: string;
    value: string;
    previous: string | null;
    change: string | null;
    direction: "better" | "worse" | "flat" | null;
    confidence: string;
    results: string | null;
    resultLabel: string;
    target: string | null;
    goalStatus: string | null;
    mainDriver: { name: string; change: string; share: string; meaning: string } | null;
    spendShare: string;
  }[];
  needsAttention: number;
  opportunities: number;
  topFinding: { title: string; whatHappened: string; action: string } | null;
  dataNotes: string[];
}

const fk = (v: number | null, mode: KpiMode, currency: string) =>
  v === null ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v, currency);

export function driverMeaning(d: Driver): string {
  const up = d.change > 0;
  switch (d.key) {
    case "cpm":
      return up ? "ads got more expensive to show" : "ads got cheaper to show";
    case "frequency":
      return up ? "the same people saw the ads more often" : "the ads reached more new people";
    case "ctr":
      return up ? "more people clicked" : "fewer people clicked";
    case "cvr":
      return up ? "more clicks turned into results" : "fewer clicks turned into results";
    case "aov":
      return up ? "people spent more per order" : "people spent less per order";
    default:
      return up ? `the ${d.label} improved` : `the ${d.label} dropped`;
  }
}

const open = (a: Analysis) => a.findings.filter((f) => f.status === "todo");

export function buildFacts(a: Analysis): NarrativeFacts {
  const cur = a.workspace.currency;
  const todo = open(a);
  const top = todo.find((f) => f.bucket === "attention") ?? todo.find((f) => f.bucket === "opportunity") ?? null;
  return {
    account: a.workspace.name,
    period: a.selection.label,
    comparePeriod: a.hasComparisonData ? a.selection.compareLabel : null,
    spend: money(a.totals.spendB, cur),
    spendChange: a.totals.change !== null ? signedPct(a.totals.change) : null,
    objectives: a.objectives.filter((o) => o.b.spend > 0).slice(0, 3).map((o) => {
      const d = mainDriver(o.decomposition);
      const good = o.change === null ? null : o.mode === "roas" ? o.change > 0.02 : o.change < -0.02;
      const flat = o.change !== null && Math.abs(o.change) <= 0.02;
      const gs = a.goalStatus.find((g) => g.objective === o.objective);
      return {
        objective: OBJECTIVE_DEFS[o.objective].label,
        kpi: kpiLabel(o.objective, o.mode),
        value: fk(o.kpiB, o.mode, cur),
        previous: o.kpiA !== null ? fk(o.kpiA, o.mode, cur) : null,
        change: o.change !== null ? signedPct(o.change) : null,
        direction: o.change === null ? null : flat ? "flat" : good ? "better" : "worse",
        confidence: o.confidence,
        results: o.kpiMissing ? null : num(resultCount(o.b, o.objective), true),
        resultLabel: OBJECTIVE_DEFS[o.objective].resultLabel,
        target: o.goal ? fk(o.goal.value, o.mode, cur) : null,
        goalStatus: gs ? gs.headline : null,
        mainDriver: d && d.weight >= 0.4 ? { name: d.label, change: signedPct(d.change), share: pct(d.weight, 0), meaning: driverMeaning(d) } : null,
        spendShare: pct(o.spendShare, 0),
      };
    }),
    needsAttention: todo.filter((f) => f.bucket === "attention").length,
    opportunities: todo.filter((f) => f.bucket === "opportunity").length,
    topFinding: top ? { title: top.title, whatHappened: top.whatHappened, action: top.action } : null,
    dataNotes: a.dataNotes.filter((n) => n.level === "warn").map((n) => n.text),
  };
}

export function factsHash(f: unknown, variant: string): string {
  return createHash("sha256").update(JSON.stringify({ f, variant })).digest("hex").slice(0, 24);
}

// The 2–4 line summary at the top of the account home: how it went, the main
// reason, and what needs attention first. Plain words, exact numbers.
export function templateSummary(a: Analysis): string[] {
  const cur = a.workspace.currency;
  const objs = a.objectives.filter((o) => o.b.spend > 0);
  if (objs.length === 0) return ["There is no spend in this period."];
  const lines: string[] = [];

  const spendLine = `You spent ${money(a.totals.spendB, cur)} in ${a.selection.label}${a.totals.change !== null && Math.abs(a.totals.change) >= 0.02 ? ` (${signedPct(a.totals.change)} vs ${a.selection.compareLabel})` : ""}.`;
  const main = objs[0];
  const def = OBJECTIVE_DEFS[main.objective];
  const label = kpiLabel(main.objective, main.mode);
  let first = spendLine;
  if (!main.kpiMissing && main.kpiB !== null) {
    const res = resultCount(main.b, main.objective);
    first += ` ${def.label}${objs.length > 1 ? ` (${pct(main.spendShare, 0)} of spend)` : ""}: ${main.mode === "cpm" ? "" : `${num(res, true)} ${def.resultLabel}, `}${label} ${fk(main.kpiB, main.mode, cur)}`;
    if (main.change !== null && main.kpiA !== null) {
      first += Math.abs(main.change) <= 0.02 ? `, about the same as before.` : ` (${main.mode === "roas" ? (main.change > 0 ? "up" : "down") : main.change > 0 ? "up" : "down"} from ${fk(main.kpiA, main.mode, cur)}).`;
    } else first += ".";
  }
  lines.push(first);

  // The biggest move among objectives with enough data, and its main driver.
  const moved = objs
    .filter((o) => o.change !== null && Math.abs(o.change) > 0.05 && o.confidence !== "low")
    .sort((x, y) => Math.abs(y.change!) * y.spendShare - Math.abs(x.change!) * x.spendShare)[0];
  const d = moved ? mainDriver(moved.decomposition) : null;
  if (moved && d && d.weight >= 0.4) {
    const better = moved.mode === "roas" ? moved.change! > 0 : moved.change! < 0;
    lines.push(
      `${OBJECTIVE_DEFS[moved.objective].label} ${better ? "improved" : "got worse"} (${kpiLabel(moved.objective, moved.mode)} ${signedPct(moved.change)}) mostly because ${driverMeaning(d)} (${d.label} ${signedPct(d.change)}).`,
    );
  } else if (objs.some((o) => o.change !== null && o.confidence === "low" && Math.abs(o.change) > 0.05)) {
    lines.push("Some numbers moved, but there's too little data to be sure the change is real yet.");
  }

  const todo = open(a);
  const attention = todo.filter((f) => f.bucket === "attention");
  const opps = todo.filter((f) => f.bucket === "opportunity");
  if (attention.length) {
    lines.push(`${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} your attention. Start with: ${attention[0].title}.`);
  } else if (opps.length) {
    lines.push(`Nothing needs fixing right now. Best opportunity: ${opps[0].title}.`);
  } else {
    lines.push("Nothing needs your attention right now.");
  }
  return lines;
}
