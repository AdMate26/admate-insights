// Explorer (Advanced): what a view is (level, columns, filters, grouping, sort), the
// quick views, and the check that a saved view from the database is well-formed.

export const EX_COLS = ["platform", "objective", "role", "spend", "share", "spendChange", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm", "results", "cvr", "kpi", "change", "expected", "impact", "priority", "confidence", "next"] as const;
export type ExCol = (typeof EX_COLS)[number];
export type ExLevel = "campaign" | "ad_group" | "ad";
export type ExGroup = "none" | "objective" | "platform" | "role" | "campaign";
export interface ExState {
  level: ExLevel;
  group: ExGroup;
  cols: ExCol[];
  sort: { key: ExCol | "name"; dir: 1 | -1 };
  q: string;
  obj: string;
  plat: string;
  prio: "all" | "high" | "medium" | "low";
  issues: boolean;
}

export const DEFAULT_COLS: ExCol[] = ["spend", "share", "results", "kpi", "change", "ctr", "cpm", "frequency", "impact", "priority", "next"];
export const DEFAULT_EX: ExState = { level: "campaign", group: "none", cols: DEFAULT_COLS, sort: { key: "spend", dir: -1 }, q: "", obj: "", plat: "", prio: "all", issues: false };

export const QUICK_VIEWS: { name: string; state: Partial<ExState> }[] = [
  { name: "Where money leaks", state: { level: "campaign", group: "none", cols: ["spend", "kpi", "change", "expected", "impact", "priority", "next"], sort: { key: "impact", dir: -1 }, issues: true } },
  { name: "Creative check", state: { level: "ad", group: "campaign", cols: ["spend", "ctr", "cvr", "kpi", "change", "frequency", "next"], sort: { key: "spend", dir: -1 }, issues: false } },
  { name: "Audience fatigue", state: { level: "ad_group", group: "none", cols: ["spend", "frequency", "ctr", "change", "cpm", "next"], sort: { key: "frequency", dir: -1 }, issues: false } },
  { name: "Top spenders", state: { level: "campaign", group: "objective", cols: DEFAULT_COLS, sort: { key: "spend", dir: -1 }, issues: false } },
];

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

// Anything read back from storage goes through here: unknown fields are dropped and
// bad values fall back to the defaults.
export function parseExState(x: unknown): ExState | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const cols = Array.isArray(o.cols) ? o.cols.filter((c): c is ExCol => EX_COLS.includes(c as ExCol)) : [];
  const sort = (o.sort ?? {}) as Record<string, unknown>;
  return {
    level: oneOf(o.level, ["campaign", "ad_group", "ad"] as const, "campaign"),
    group: oneOf(o.group, ["none", "objective", "platform", "role", "campaign"] as const, "none"),
    cols: cols.length ? [...new Set(cols)] : DEFAULT_COLS,
    sort: { key: oneOf(sort.key, [...EX_COLS, "name"] as const, "spend"), dir: sort.dir === 1 ? 1 : -1 },
    q: typeof o.q === "string" ? o.q.slice(0, 100) : "",
    obj: typeof o.obj === "string" ? o.obj.slice(0, 40) : "",
    plat: typeof o.plat === "string" ? o.plat.slice(0, 40) : "",
    prio: oneOf(o.prio, ["all", "high", "medium", "low"] as const, "all"),
    issues: o.issues === true,
  };
}

// One row of the Explorer table (plain data, sent to the browser).
export interface ExRow {
  id: string;
  level: ExLevel;
  name: string;
  campaignName: string | null;
  adSetName: string | null;
  platform: string;
  objective: string;
  objectiveLabel: string;
  role: string;
  spend: number;
  share: number;
  spendChange: number | null;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  results: number;
  revenue: number;
  cvr: number | null;
  kpi: number | null;
  kpiShort: string;
  mode: "cost" | "roas" | "cpm";
  change: number | null;
  confidence: "high" | "medium" | "low";
  expected: number | null;
  impact: { amount: number; label: string } | null;
  priority: "high" | "medium" | "low" | "monitor" | null;
  next: string | null;
  issue: boolean;
  href: string | null;
}
