import type { NormalizedDailyRow } from "../tiktok/contract";

/**
 * DETERMINISTIC ANALYSIS ENGINE.
 *
 * Every number and every classification in the app is produced here, in code:
 * metric aggregation, week-over-week comparisons, z-score anomaly detection,
 * threshold crossings and severity ranking.
 *
 * The AI layer NEVER computes or classifies anything — it only renders the
 * findings produced here into natural language.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingEvidence = {
  metric: string;
  current: number;
  previous: number;
  changePct: number;
  unit: "currency" | "percent" | "ratio" | "count";
  currentWindow: string;
  previousWindow: string;
  spendInWindow: number;
  supporting: { label: string; value: string }[];
  method: string;
};

export type Finding = {
  code: string;
  entityLevel: "campaign" | "adset" | "ad";
  entityId: string;
  entityName: string;
  metric: string;
  severity: Severity;
  severityScore: number;
  title: string;
  whatChanged: string;
  whyItMatters: string;
  evidence: FindingEvidence;
};

export type AnalysisResult = {
  windowStart: string;
  windowEnd: string;
  totalSpend: number;
  currentWindow: string;
  previousWindow: string;
  findings: Finding[];
};

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  reach: number;
  budget: number;
  days: number;
};

const EMPTY: Totals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  reach: 0,
  budget: 0,
  days: 0,
};

function add(a: Totals, r: NormalizedDailyRow): Totals {
  return {
    spend: a.spend + r.spend,
    impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks,
    conversions: a.conversions + r.conversions,
    revenue: a.revenue + r.revenue,
    reach: a.reach + r.reach,
    budget: a.budget + r.dailyBudget,
    days: a.days + 1,
  };
}

const cpa = (t: Totals) => (t.conversions > 0 ? t.spend / t.conversions : Number.NaN);
const ctr = (t: Totals) => (t.impressions > 0 ? t.clicks / t.impressions : Number.NaN);
const cvr = (t: Totals) => (t.clicks > 0 ? t.conversions / t.clicks : Number.NaN);
const roas = (t: Totals) => (t.spend > 0 ? t.revenue / t.spend : Number.NaN);
const frequency = (t: Totals) => (t.reach > 0 ? t.impressions / t.reach : Number.NaN);

function pctChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return Number.NaN;
  return ((current - previous) / previous) * 100;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Severity is classified in code from change magnitude and spend exposure. */
function classifySeverity(absChangePct: number, spendInWindow: number): {
  severity: Severity;
  score: number;
} {
  const magnitude = Math.min(absChangePct / 50, 2); // 50% change = 1.0
  const exposure = Math.min(spendInWindow / 3000, 2); // $3k in window = 1.0
  const score = Number((magnitude * 0.65 + exposure * 0.35).toFixed(3));
  const severity: Severity =
    score >= 1.2 ? "critical" : score >= 0.85 ? "high" : score >= 0.5 ? "medium" : "low";
  return { severity, score };
}

type Group = { id: string; name: string; rows: NormalizedDailyRow[] };

function groupBy(
  rows: NormalizedDailyRow[],
  idOf: (r: NormalizedDailyRow) => string,
  nameOf: (r: NormalizedDailyRow) => string,
): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const id = idOf(r);
    const existing = map.get(id);
    if (existing) existing.rows.push(r);
    else map.set(id, { id, name: nameOf(r), rows: [r] });
  }
  return [...map.values()];
}

const sum = (rows: NormalizedDailyRow[]) => rows.reduce(add, EMPTY);

function dailySeries(rows: NormalizedDailyRow[]): { date: string; totals: Totals }[] {
  const byDate = new Map<string, Totals>();
  for (const r of rows) byDate.set(r.date, add(byDate.get(r.date) ?? EMPTY, r));
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, totals]) => ({ date, totals }));
}

export function runAnalysis(rows: NormalizedDailyRow[], windowDays = 7): AnalysisResult {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const currentDates = dates.slice(-windowDays);
  const previousDates = dates.slice(-windowDays * 2, -windowDays);
  const currentSet = new Set(currentDates);
  const previousSet = new Set(previousDates);

  const currentWindow = `${currentDates[0]} → ${currentDates[currentDates.length - 1]}`;
  const previousWindow = `${previousDates[0]} → ${previousDates[previousDates.length - 1]}`;

  const findings: Finding[] = [];

  const push = (
    base: Omit<Finding, "severity" | "severityScore" | "evidence"> & {
      evidence: Omit<FindingEvidence, "currentWindow" | "previousWindow">;
    },
  ) => {
    const { severity, score } = classifySeverity(
      Math.abs(base.evidence.changePct),
      base.evidence.spendInWindow,
    );
    findings.push({
      ...base,
      severity,
      severityScore: score,
      evidence: { ...base.evidence, currentWindow, previousWindow },
    });
  };

  const levels: {
    level: Finding["entityLevel"];
    groups: Group[];
    minSpend: number;
  }[] = [
    {
      level: "campaign",
      groups: groupBy(
        rows,
        (r) => r.campaignId,
        (r) => r.campaignName,
      ),
      minSpend: 500,
    },
    {
      level: "adset",
      groups: groupBy(
        rows,
        (r) => r.adsetId,
        (r) => r.adsetName,
      ),
      minSpend: 300,
    },
    {
      level: "ad",
      groups: groupBy(
        rows,
        (r) => r.adId,
        (r) => r.adName,
      ),
      minSpend: 300,
    },
  ];

  for (const { level, groups, minSpend } of levels) {
    for (const group of groups) {
      const cur = sum(group.rows.filter((r) => currentSet.has(r.date)));
      const prev = sum(group.rows.filter((r) => previousSet.has(r.date)));
      if (cur.spend < minSpend) continue;

      const supportingBase = [
        { label: "Spend (current window)", value: money(cur.spend) },
        { label: "Conversions", value: `${num(cur.conversions)} vs ${num(prev.conversions)}` },
        { label: "Clicks", value: `${num(cur.clicks)} vs ${num(prev.clicks)}` },
      ];

      // --- Rule 1: CPA change (threshold crossing, WoW) --------------------
      const cpaChange = pctChange(cpa(cur), cpa(prev));
      if (Number.isFinite(cpaChange) && cpaChange >= 20 && cur.conversions >= 10) {
        push({
          code: "cpa_increase",
          entityLevel: level,
          entityId: group.id,
          entityName: group.name,
          metric: "CPA",
          title: `CPA up ${cpaChange.toFixed(1)}% on ${group.name}`,
          whatChanged: `CPA moved from ${money(cpa(prev))} to ${money(cpa(cur))} week over week (+${cpaChange.toFixed(1)}%).`,
          whyItMatters: `${money(cur.spend)} of spend in the last ${windowDays} days is buying conversions at a materially higher cost, which compresses contribution margin.`,
          evidence: {
            metric: "CPA",
            current: Number(cpa(cur).toFixed(2)),
            previous: Number(cpa(prev).toFixed(2)),
            changePct: Number(cpaChange.toFixed(2)),
            unit: "currency",
            spendInWindow: Number(cur.spend.toFixed(2)),
            method: `Aggregated last ${windowDays} days vs prior ${windowDays} days; threshold +20% CPA with >= 10 conversions.`,
            supporting: [
              ...supportingBase,
              { label: "CPC", value: `${money(cur.spend / cur.clicks)} vs ${money(prev.spend / prev.clicks)}` },
              { label: "CVR", value: `${pct(cvr(cur))} vs ${pct(cvr(prev))}` },
            ],
          },
        });
      }

      // --- Rule 2: CTR drop, with creative-fatigue confirmation -----------
      const ctrChange = pctChange(ctr(cur), ctr(prev));
      const freqChange = pctChange(frequency(cur), frequency(prev));
      if (Number.isFinite(ctrChange) && ctrChange <= -12) {
        const fatigue = Number.isFinite(freqChange) && freqChange >= 15;
        push({
          code: fatigue ? "creative_fatigue" : "ctr_drop",
          entityLevel: level,
          entityId: group.id,
          entityName: group.name,
          metric: "CTR",
          title: fatigue
            ? `Creative fatigue pattern on ${group.name}`
            : `CTR down ${Math.abs(ctrChange).toFixed(1)}% on ${group.name}`,
          whatChanged: `CTR fell from ${pct(ctr(prev))} to ${pct(ctr(cur))} (${ctrChange.toFixed(1)}%)${
            fatigue
              ? `, while frequency rose from ${num(frequency(prev))} to ${num(frequency(cur))} (+${freqChange.toFixed(1)}%)`
              : ""
          }.`,
          whyItMatters: fatigue
            ? `Falling CTR alongside rising frequency is the deterministic signature of audience saturation: the same users are seeing the creative more often and responding less.`
            : `Lower CTR raises CPC and reduces the volume this entity can deliver at the same budget.`,
          evidence: {
            metric: "CTR",
            current: Number((ctr(cur) * 100).toFixed(3)),
            previous: Number((ctr(prev) * 100).toFixed(3)),
            changePct: Number(ctrChange.toFixed(2)),
            unit: "percent",
            spendInWindow: Number(cur.spend.toFixed(2)),
            method: `CTR WoW threshold -12%; fatigue confirmed when frequency (impressions/reach) rises >= 15% in the same window.`,
            supporting: [
              ...supportingBase,
              { label: "Frequency", value: `${num(frequency(cur))} vs ${num(frequency(prev))}` },
              { label: "Impressions", value: `${num(cur.impressions)} vs ${num(prev.impressions)}` },
            ],
          },
        });
      }

      // --- Rule 3: CVR break ---------------------------------------------
      const cvrChange = pctChange(cvr(cur), cvr(prev));
      if (Number.isFinite(cvrChange) && cvrChange <= -25 && cur.clicks >= 200) {
        push({
          code: "cvr_break",
          entityLevel: level,
          entityId: group.id,
          entityName: group.name,
          metric: "CVR",
          title: `Conversion rate broke ${cvrChange.toFixed(1)}% on ${group.name}`,
          whatChanged: `Click-to-conversion rate fell from ${pct(cvr(prev))} to ${pct(cvr(cur))} while clicks stayed at ${num(cur.clicks)} (vs ${num(prev.clicks)}).`,
          whyItMatters: `Traffic volume is intact but it stopped converting — spend continues while conversions do not, so this is the fastest way to waste budget.`,
          evidence: {
            metric: "CVR",
            current: Number((cvr(cur) * 100).toFixed(3)),
            previous: Number((cvr(prev) * 100).toFixed(3)),
            changePct: Number(cvrChange.toFixed(2)),
            unit: "percent",
            spendInWindow: Number(cur.spend.toFixed(2)),
            method: `CVR WoW threshold -25% with >= 200 clicks in the current window.`,
            supporting: [
              ...supportingBase,
              { label: "ROAS", value: `${num(roas(cur))}x vs ${num(roas(prev))}x` },
            ],
          },
        });
      }

      // --- Rule 4: ROAS decline ------------------------------------------
      const roasChange = pctChange(roas(cur), roas(prev));
      if (Number.isFinite(roasChange) && roasChange <= -20 && level === "campaign") {
        push({
          code: "roas_decline",
          entityLevel: level,
          entityId: group.id,
          entityName: group.name,
          metric: "ROAS",
          title: `ROAS down ${Math.abs(roasChange).toFixed(1)}% on ${group.name}`,
          whatChanged: `ROAS moved from ${num(roas(prev))}x to ${num(roas(cur))}x (${roasChange.toFixed(1)}%) on ${money(cur.spend)} of spend.`,
          whyItMatters: `Revenue efficiency at the campaign level dropped, so the same budget is returning less revenue.`,
          evidence: {
            metric: "ROAS",
            current: Number(roas(cur).toFixed(3)),
            previous: Number(roas(prev).toFixed(3)),
            changePct: Number(roasChange.toFixed(2)),
            unit: "ratio",
            spendInWindow: Number(cur.spend.toFixed(2)),
            method: `Campaign-level ROAS (revenue/spend) WoW threshold -20%.`,
            supporting: [
              ...supportingBase,
              { label: "Revenue", value: `${money(cur.revenue)} vs ${money(prev.revenue)}` },
            ],
          },
        });
      }

      // --- Rule 5: budget pacing ------------------------------------------
      if (level === "adset" && cur.budget > 0) {
        const pacing = cur.spend / cur.budget;
        if (pacing < 0.75) {
          const changePct = (pacing - 1) * 100;
          push({
            code: "budget_underpacing",
            entityLevel: level,
            entityId: group.id,
            entityName: group.name,
            metric: "Budget pacing",
            title: `${group.name} is pacing at ${(pacing * 100).toFixed(0)}% of budget`,
            whatChanged: `Delivered ${money(cur.spend)} against ${money(cur.budget)} of available budget over ${cur.days} days (${(pacing * 100).toFixed(0)}% pacing).`,
            whyItMatters: `Unspent budget on a converting ad group is lost volume: planned reach is not being bought at all.`,
            evidence: {
              metric: "Pacing",
              current: Number((pacing * 100).toFixed(2)),
              previous: 100,
              changePct: Number(changePct.toFixed(2)),
              unit: "percent",
              spendInWindow: Number(cur.spend.toFixed(2)),
              method: `Pacing = window spend / (daily budget summed over window); threshold < 75%.`,
              supporting: [
                { label: "Available budget", value: money(cur.budget) },
                { label: "Unspent", value: money(cur.budget - cur.spend) },
                { label: "CPA", value: money(cpa(cur)) },
              ],
            },
          });
        }
      }

      // --- Rule 6: daily CPA anomaly (z-score trend break) ----------------
      if (level === "ad") {
        const series = dailySeries(group.rows).filter((d) => d.totals.conversions > 0);
        if (series.length >= 14) {
          const cpas = series.map((d) => d.totals.spend / d.totals.conversions);
          const baseline = cpas.slice(0, -3);
          const recent = cpas.slice(-3);
          const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
          const sd = Math.sqrt(
            baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, baseline.length - 1),
          );
          const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
          const z = sd > 0 ? (recentMean - mean) / sd : 0;
          if (z >= 2) {
            const changePct = pctChange(recentMean, mean);
            push({
              code: "cpa_anomaly",
              entityLevel: level,
              entityId: group.id,
              entityName: group.name,
              metric: "Daily CPA (z-score)",
              title: `Statistical CPA anomaly on ${group.name} (z = ${z.toFixed(2)})`,
              whatChanged: `The last 3 days average ${money(recentMean)} CPA against a ${baseline.length}-day baseline of ${money(mean)} (σ = ${money(sd)}), i.e. ${z.toFixed(2)} standard deviations above normal.`,
              whyItMatters: `This is outside normal daily variance, so it is a real break rather than noise and warrants intervention now.`,
              evidence: {
                metric: "Daily CPA",
                current: Number(recentMean.toFixed(2)),
                previous: Number(mean.toFixed(2)),
                changePct: Number((Number.isFinite(changePct) ? changePct : 0).toFixed(2)),
                unit: "currency",
                spendInWindow: Number(cur.spend.toFixed(2)),
                method: `Z-score of trailing 3-day mean daily CPA vs prior-day baseline mean/σ; threshold z >= 2.`,
                supporting: [
                  { label: "Baseline σ", value: money(sd) },
                  { label: "Baseline days", value: String(baseline.length) },
                  { label: "Z-score", value: z.toFixed(2) },
                ],
              },
            });
          }
        }
      }
    }
  }

  findings.sort((a, b) => b.severityScore - a.severityScore);

  return {
    windowStart: dates[0] ?? "",
    windowEnd: dates[dates.length - 1] ?? "",
    totalSpend: Number(sum(rows).spend.toFixed(2)),
    currentWindow,
    previousWindow,
    findings,
  };
}
