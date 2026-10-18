import { money, pct } from "../format";
import type { Measures } from "../metrics/measures";
import { OBJECTIVE_DEFS, type KpiMode, type Objective } from "../metrics/objectives";
import { decompose, type Driver } from "./decompose";
import type { EntityLevel } from "./types";

export type { EntityLevel };

// Words for campaign / ad set / ad in sentences.
export const LEVEL_WORD: Record<EntityLevel, { one: string; many: string }> = {
  campaign: { one: "campaign", many: "campaigns" },
  ad_group: { one: "ad set", many: "ad sets" },
  ad: { one: "ad", many: "ads" },
};

export interface Reason {
  key: Driver["key"];
  text: string; // "cheaper delivery — CPM $0.09 vs $0.14"
  share: number; // share of the gap this reason explains (0–1)
}

// KPI names inside a sentence: "cost per follow", but "ROAS" and "CPL" stay as-is.
export function inSentence(label: string): string {
  return label.length > 1 && label[1] === label[1].toUpperCase() && /[A-Z]/.test(label[1]) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

// How a driver reads when it favours `winner` over `loser`.
function reasonText(d: Driver, objective: Objective, winnerVal: number, loserVal: number, currency: string): string {
  const res = OBJECTIVE_DEFS[objective].resultLabel;
  switch (d.key) {
    case "cpm":
      return `cheaper delivery — CPM ${money(winnerVal, currency)} vs ${money(loserVal, currency)}`;
    case "ctr":
      return `more people clicked — CTR ${pct(winnerVal)} vs ${pct(loserVal)}`;
    case "cvr":
      return `more clicks became ${res} — conversion rate ${pct(winnerVal)} vs ${pct(loserVal)}`;
    case "rate":
      return `more ${res} per impression — ${pct(winnerVal)} vs ${pct(loserVal)}`;
    case "frequency":
      return `reached more new people — frequency ${winnerVal.toFixed(2)} vs ${loserVal.toFixed(2)}`;
    case "aov":
      return `bigger orders — ${money(winnerVal, currency)} vs ${money(loserVal, currency)} per order`;
  }
}

// Reasons why `winner` beat `loser`: the drivers of the KPI gap that favour the
// winner, largest first (log decomposition).
export function reasonsFor(objective: Objective, mode: KpiMode, winner: Measures, loser: Measures, currency: string, max = 2): Reason[] {
  const d = decompose(objective, mode, loser, winner); // change from loser → winner
  if (!d) return [];
  return d.drivers
    .filter((x) => x.helped && Number.isFinite(x.change) && Math.abs(x.change) >= 0.03)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, max)
    .map((x) => ({ key: x.key, share: x.weight, text: reasonText(x, objective, x.b, x.a, currency) }));
}

// What to reuse, based on the main reason something won.
export const LESSON: Record<Driver["key"], (level: string) => string> = {
  cpm: (l) => `Reuse this ${l}'s audience and placements — it reaches people more cheaply.`,
  ctr: (l) => `Reuse this ${l}'s creative (hook, format, message) — people click it more.`,
  rate: (l) => `Reuse this ${l}'s creative and message — people react to it more.`,
  cvr: (l) => `Reuse the offer and landing page behind this ${l} — its clicks turn into results more often.`,
  frequency: (l) => `Keep audiences broad like this ${l} — it reaches new people instead of repeating to the same ones.`,
  aov: (l) => `Reuse this ${l}'s product and offer focus — it brings bigger orders.`,
};
