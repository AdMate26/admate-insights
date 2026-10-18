import type { Measures } from "../metrics/measures";
import { OBJECTIVE_DEFS, resultCount, type KpiMode, type Objective } from "../metrics/objectives";

export interface Driver {
  key: "cpm" | "frequency" | "ctr" | "cvr" | "rate" | "aov";
  label: string;
  a: number;
  b: number;
  change: number; // b/a − 1
  // Share of the KPI's (log) change this driver explains. Shares sum to 1;
  // a share > 0 moved the KPI in the direction it actually moved.
  share: number;
  // Whether this driver on its own pushed the KPI in the good direction.
  helped: boolean;
  // Share of the total movement, counting drivers that pulled in opposite
  // directions separately (0–1, sums to 1). Used for display: when CPM helped
  // and CTR hurt, both can't be "100%".
  weight: number;
}

export interface Decomposition {
  kpiChange: number;
  drivers: Driver[];
}

const rateLabel: Record<Objective, string> = {
  awareness: "reach per impression",
  engagement: "engagement rate",
  followers: "follow rate",
  video_views: "view rate",
  traffic: "CTR",
  website_visits: "visit rate",
  app_registrations: "result rate",
  leads: "result rate",
  messages: "result rate",
  app_installs: "result rate",
  sales: "result rate",
};

// Metric-tree decomposition with log changes so contributions add up exactly:
//   cost per result = CPM ÷ (1000 × CTR × CVR)       (post-click objectives)
//   cost per result = CPM ÷ (1000 × result rate)     (on-platform objectives)
//   cost per 1K reached = CPM × frequency            (awareness)
//   ROAS = 1000 × CTR × CVR × AOV ÷ CPM              (sales with revenue)
export function decompose(objective: Objective, mode: KpiMode, a: Measures, b: Measures): Decomposition | null {
  if (mode === "cpm") return null; // CPM is itself the driver
  const ra = resultCount(a, objective);
  const rb = resultCount(b, objective);
  if (a.impressions <= 0 || b.impressions <= 0 || a.spend <= 0 || b.spend <= 0) return null;

  // [key, label, valueA, valueB, sign] — sign is how the driver enters ln(KPI).
  const terms: [Driver["key"], string, number, number, 1 | -1][] = [];
  const cpmA = (a.spend / a.impressions) * 1000;
  const cpmB = (b.spend / b.impressions) * 1000;
  const costSign = mode === "roas" ? -1 : 1;
  terms.push(["cpm", "CPM", cpmA, cpmB, costSign as 1 | -1]);

  if (objective === "awareness" && mode === "cost") {
    if (a.reach <= 0 || b.reach <= 0) return null;
    terms.push(["frequency", "Frequency", a.impressions / a.reach, b.impressions / b.reach, 1]);
  } else {
    if (ra <= 0 || rb <= 0) return null;
    const split = OBJECTIVE_DEFS[objective].postClick && a.linkClicks > 0 && b.linkClicks > 0;
    if (split) {
      terms.push(["ctr", "CTR", a.linkClicks / a.impressions, b.linkClicks / b.impressions, (-costSign) as 1 | -1]);
      terms.push(["cvr", "Conversion rate", ra / a.linkClicks, rb / b.linkClicks, (-costSign) as 1 | -1]);
    } else {
      terms.push(["rate", rateLabel[objective], ra / a.impressions, rb / b.impressions, (-costSign) as 1 | -1]);
    }
    if (mode === "roas") terms.push(["aov", "Order value", a.conversionValue / ra, b.conversionValue / rb, 1]);
  }

  const logs = terms.map(([, , va, vb, sign]) => (va > 0 && vb > 0 ? sign * Math.log(vb / va) : 0));
  const total = logs.reduce((s, x) => s + x, 0);
  const moved = logs.reduce((s, x) => s + Math.abs(x), 0);
  const kpiChange = Math.exp(total) - 1;
  const higherIsBetter = mode === "roas";
  return {
    kpiChange,
    drivers: terms.map(([key, label, va, vb], i) => ({
      key,
      label,
      a: va,
      b: vb,
      change: vb / va - 1,
      share: total !== 0 ? logs[i] / total : 0,
      helped: higherIsBetter ? logs[i] > 0 : logs[i] < 0,
      weight: moved > 0 ? Math.abs(logs[i]) / moved : 0,
    })),
  };
}

// The driver that moved the KPI the most.
export function mainDriver(d: Decomposition | null): Driver | null {
  if (!d || d.drivers.length === 0) return null;
  return [...d.drivers].sort((x, y) => y.weight - x.weight)[0];
}
