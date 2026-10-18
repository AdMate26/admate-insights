import type { MeasureKey, Measures } from "./measures";
import { OBJECTIVE_DEFS, RESULT_MEASURES, resultCount, type Objective, type Polarity } from "./objectives";
import type { Avail } from "./availability";

export type Unit = "currency" | "percent" | "number" | "ratio";

export interface MetricDef {
  key: string;
  label: string;
  short: string;
  unit: Unit;
  // null polarity = neutral (spend, impressions): shown without good/bad colour.
  polarity: Polarity | null;
  compute: (m: Measures, objective: Objective) => number | null;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export const METRICS = {
  spend: { key: "spend", label: "Amount spent", short: "Spend", unit: "currency", polarity: null, compute: (m) => m.spend },
  impressions: { key: "impressions", label: "Impressions", short: "Impr.", unit: "number", polarity: null, compute: (m) => m.impressions },
  reach: { key: "reach", label: "Reach", short: "Reach", unit: "number", polarity: "higher", compute: (m) => (m.reach > 0 ? m.reach : null) },
  results: { key: "results", label: "Results", short: "Results", unit: "number", polarity: "higher", compute: (m, o) => resultCount(m, o) },
  cpm: { key: "cpm", label: "Cost per 1,000 impressions", short: "CPM", unit: "currency", polarity: "lower", compute: (m) => { const v = div(m.spend, m.impressions); return v === null ? null : v * 1000; } },
  frequency: { key: "frequency", label: "Frequency", short: "Freq.", unit: "ratio", polarity: null, compute: (m) => div(m.impressions, m.reach) },
  ctr: { key: "ctr", label: "Link click-through rate", short: "CTR", unit: "percent", polarity: "higher", compute: (m) => div(m.linkClicks, m.impressions) },
  ctrAll: { key: "ctrAll", label: "Click-through rate (all)", short: "CTR (all)", unit: "percent", polarity: "higher", compute: (m) => div(m.clicksAll, m.impressions) },
  cpc: { key: "cpc", label: "Cost per link click", short: "CPC", unit: "currency", polarity: "lower", compute: (m) => div(m.spend, m.linkClicks) },
  cvr: { key: "cvr", label: "Conversion rate (results ÷ link clicks)", short: "CVR", unit: "percent", polarity: "higher", compute: (m, o) => div(resultCount(m, o), m.linkClicks) },
  resultRate: { key: "resultRate", label: "Result rate (results ÷ impressions)", short: "Result rate", unit: "percent", polarity: "higher", compute: (m, o) => div(resultCount(m, o), m.impressions) },
  roas: { key: "roas", label: "Return on ad spend", short: "ROAS", unit: "ratio", polarity: "higher", compute: (m) => (m.conversionValue > 0 ? div(m.conversionValue, m.spend) : null) },
  aov: { key: "aov", label: "Average order value", short: "AOV", unit: "currency", polarity: "higher", compute: (m, o) => (m.conversionValue > 0 ? div(m.conversionValue, resultCount(m, o)) : null) },
  viewRate: { key: "viewRate", label: "Video view rate", short: "View rate", unit: "percent", polarity: "higher", compute: (m) => div(m.videoViews || m.thruplays, m.impressions) },
  engagementRate: { key: "engagementRate", label: "Engagement rate", short: "Eng. rate", unit: "percent", polarity: "higher", compute: (m) => div(m.engagements, m.impressions) },
  formCompletion: { key: "formCompletion", label: "Lead form completion", short: "Form rate", unit: "percent", polarity: "higher", compute: (m) => (m.leadFormOpens > 0 ? div(m.leads, m.leadFormOpens) : null) },
} satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;

// Inputs each metric needs. Each group is "any one of"; "result" = the
// objective's result measure.
const NEEDS: Record<MetricKey, (MeasureKey | "result")[][]> = {
  spend: [["spend"]],
  impressions: [["impressions"]],
  reach: [["reach"]],
  results: [["result"]],
  cpm: [["spend"], ["impressions"]],
  frequency: [["impressions"], ["reach"]],
  ctr: [["linkClicks"], ["impressions"]],
  ctrAll: [["clicksAll"], ["impressions"]],
  cpc: [["spend"], ["linkClicks"]],
  cvr: [["result"], ["linkClicks"]],
  resultRate: [["result"], ["impressions"]],
  roas: [["conversionValue"], ["spend"]],
  aov: [["conversionValue"], ["result"]],
  viewRate: [["videoViews", "thruplays"], ["impressions"]],
  engagementRate: [["engagements"], ["impressions"]],
  formCompletion: [["leads"], ["leadFormOpens"]],
};

// Whether a metric can be computed from numbers with this availability.
export function metricAvailable(key: MetricKey, objective: Objective, avail: Avail): boolean {
  return NEEDS[key].every((group) => group.some((k) => (k === "result" ? RESULT_MEASURES[objective].some((r) => avail.has(r)) : avail.has(k))));
}

// Supporting metrics shown next to the primary KPI, per objective (PRD §7.1).
export const SUPPORTING: Record<Objective, MetricKey[]> = {
  awareness: ["reach", "cpm", "frequency", "ctr"],
  engagement: ["results", "engagementRate", "cpm", "ctr"],
  followers: ["results", "resultRate", "cpm", "frequency"],
  video_views: ["results", "viewRate", "cpm", "frequency"],
  traffic: ["results", "ctr", "cpm", "frequency"],
  website_visits: ["results", "cvr", "ctr", "cpm"],
  app_registrations: ["results", "cvr", "ctr", "cpm"],
  leads: ["results", "cvr", "ctr", "cpm"],
  messages: ["results", "cvr", "ctr", "cpm"],
  app_installs: ["results", "cvr", "ctr", "cpm"],
  sales: ["results", "cvr", "ctr", "cpm"],
};

export function metricLabelFor(key: MetricKey, objective: Objective): string {
  if (key === "results") {
    const r = OBJECTIVE_DEFS[objective].resultLabel;
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  return METRICS[key].short;
}
