import { addDays, rangeDays } from "../dates";
import { money, signedPct } from "../format";
import { emptyMeasures, scaleMeasures, sumMeasures, MEASURE_KEYS, type Measures } from "../metrics/measures";
import { chooseMode, intersectAvail, kpiAvailable, MEASURE_LABEL, withoutReach, ALL_MEASURES, type Avail } from "../metrics/availability";
import { METRICS, SUPPORTING, metricAvailable, metricLabelFor } from "../metrics/metrics";
import { kpiShort, kpiValue, OBJECTIVE_DEFS, OBJECTIVES, RESULT_MEASURES, resultCount, type KpiMode, type Objective } from "../metrics/objectives";
import type { Platform } from "../ingest/headers";
import { isRunning } from "../ingest/normalize";
import { decompose } from "./decompose";
import { advantage } from "./wording";
import { detect } from "./detectors";
import { breakEven, goalYardstick, performanceIndex, type Goal } from "./goals";
import { computeGoalStatus } from "./goalStatus";
import { computeDataNotes } from "./dataNotes";
import { changeConfidence, levelConfidence, type Confidence } from "./stats";
import { resolveRole, type Role, type RoleSource } from "./roles";
import { MATURITY_DAYS } from "./stability";
import type { Analysis, AnalysisInput, CampaignInfo, CampaignRow, DailyPoint, EntityLevel, FactRow, ObjectiveSummary, PlatformSummary, Verdict } from "./types";

export { performanceIndex };

// Items need at least this many similar items to be compared with "similar ones".
export const MIN_PEERS = 2; // + the item itself = a group of 3

interface Agg {
  m: Measures;
  avail: Set<(typeof MEASURE_KEYS)[number]>;
  rows: number; // fact rows added up (reach is only exact for one row)
}

// Sum facts per key, tracking which measures every part contains.
function aggregate(facts: FactRow[], key: (f: FactRow) => string | null | undefined, columns?: Map<string, Avail>): Map<string, Agg> {
  const parts = new Map<string, { m: Measures; avails: Avail[]; rows: number }>();
  for (const f of facts) {
    const k = key(f);
    if (!k) continue;
    const p = parts.get(k) ?? { m: emptyMeasures(), avails: [], rows: 0 };
    for (const mk of MEASURE_KEYS) p.m[mk] += f.measures[mk];
    const cols = f.importId ? columns?.get(f.importId) : undefined;
    p.avails.push(cols ?? ALL_MEASURES);
    p.rows++;
    parts.set(k, p);
  }
  const out = new Map<string, Agg>();
  for (const [k, p] of parts) {
    const avail = intersectAvail(p.avails);
    out.set(k, { m: p.m, avail: p.rows > 1 ? withoutReach(avail) : avail, rows: p.rows });
  }
  return out;
}

function mergeAggs(list: Agg[]): Agg {
  const rows = list.reduce((s, x) => s + x.rows, 0);
  const avail = intersectAvail(list.map((x) => x.avail));
  return { m: sumMeasures(list.map((x) => x.m)), avail: rows > 1 ? withoutReach(avail) : avail, rows };
}

const fmtKpi = (v: number | null, mode: KpiMode, currency: string) =>
  v === null ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v, currency);

// Verdict rules (PRD §7.3), evaluated on the primary KPI of the campaign's objective.
function verdictFor(row: Omit<CampaignRow, "verdict" | "reason">, currency: string): { verdict: Verdict; reason: string } {
  const { info, mode, b, kpiB, piGoal, piTrend, piPeer, confidence, goal, breakEven: be } = row;
  const short = kpiShort(info.objective, mode);
  if (b.spend <= 0) return { verdict: "idle", reason: "No spend in this period." };
  if (!kpiAvailable(info.objective, mode, row.availB)) {
    const missing = RESULT_MEASURES[info.objective].map((k) => MEASURE_LABEL[k]).join(" or ");
    return { verdict: "no_data", reason: `Your export has no ${missing} column, so this can't be judged by ${short}.` };
  }
  if (kpiB === null) {
    return b.spend > 0 && resultCount(b, info.objective) === 0
      ? { verdict: confidence === "low" ? "watch" : "attention", reason: `Spent ${money(b.spend, currency)} with no ${OBJECTIVE_DEFS[info.objective].resultLabel} yet.` }
      : { verdict: "no_data", reason: "Not enough data to judge." };
  }

  const reasons: string[] = [];
  let verdict: Verdict = "on_track";
  const losingMoney = be !== null && performanceIndex(kpiB, be, mode)! < 1;
  const goalText = goal ? `${short} ${fmtKpi(kpiB, mode, currency)} vs ${goal.source === "target" ? "target" : "break-even"} ${fmtKpi(goal.value, mode, currency)}` : null;

  if ((piGoal !== null && piGoal < 0.7) || losingMoney) {
    verdict = "critical";
    reasons.push(losingMoney ? `Below break-even: ${short} ${fmtKpi(kpiB, mode, currency)} vs ${fmtKpi(be, mode, currency)}.` : `${goalText} (${advantage(piGoal!, mode)}).`);
  } else if ((piGoal !== null && piGoal < 0.9) || (piTrend !== null && piTrend < 0.85)) {
    verdict = "attention";
    if (piGoal !== null && piGoal < 0.9) reasons.push(`${goalText}.`);
    if (piTrend !== null && piTrend < 0.85) reasons.push(`${short} ${signedPct(row.change)} vs the comparison period.`);
  } else if ((piGoal !== null ? piGoal > 1.2 : piPeer !== null && piPeer > 1.2) && (piTrend === null || piTrend >= 0.9)) {
    verdict = "outperforming";
    reasons.push(
      piGoal !== null
        ? `${goalText} — ${advantage(piGoal, mode)}.`
        : `${short} ${fmtKpi(kpiB, mode, currency)} is ${advantage(piPeer!, mode)} than the ${row.peerCount} similar ones on this platform.`,
    );
  } else {
    reasons.push(goalText ? `${goalText}.` : piPeer !== null ? `In line with similar ones (${short} ${fmtKpi(kpiB, mode, currency)}).` : `${short} ${fmtKpi(kpiB, mode, currency)}.`);
  }

  // A verdict that would alert on low volume is downgraded to "watch".
  if (confidence === "low" && (verdict === "critical" || verdict === "attention" || verdict === "outperforming")) {
    return { verdict: "watch", reason: `${reasons.join(" ")} Low volume — treat as an early signal.` };
  }
  return { verdict, reason: reasons.join(" ") };
}

export function analyze(input: AnalysisInput): Analysis {
  const { selection, campaigns, workspace } = input;
  const currency = workspace.currency;
  const goalsByObj = new Map<Objective, Goal>(input.goals.map((g) => [g.objective, g]));
  const lenB = rangeDays(selection.b.from, selection.b.to);
  const lenA = selection.a ? rangeDays(selection.a.from, selection.a.to) : lenB;
  const scaleA = lenB / lenA;
  // Reach counts unique people: a 31-day reach scaled to 5 days means nothing.
  const aAvail = (x: Avail) => (scaleA !== 1 ? withoutReach(x) : new Set(x));

  const hasComparisonData = input.factsA.some((f) => f.measures.spend > 0);
  const info = new Map(campaigns.map((c) => [c.id, c]));

  // Conversions keep arriving for days after a click: daily rows that ended less
  // than `maturity` days before their report was uploaded may still grow.
  const maturity = input.maturityDays ?? MATURITY_DAYS;
  const uploaded = new Map(input.coverage.reports.filter((r) => r.uploadedAt).map((r) => [r.importId, r.uploadedAt!]));
  const isImmature = (f: FactRow) => {
    if (maturity <= 0 || f.granularity !== "daily" || !f.importId) return false;
    const up = uploaded.get(f.importId);
    const o = info.get(f.campaignId)?.objective;
    return !!up && !!o && OBJECTIVE_DEFS[o].postClick && f.periodEnd > addDays(up, -maturity);
  };
  const matureB = input.factsB.filter((f) => !isImmature(f));
  const hasImmature = matureB.length < input.factsB.length;

  // Funnel roles: the user's choice, else guessed from names (roles.ts).
  const campaignRoles = new Map(campaigns.map((c) => [c.id, resolveRole({ role: c.role ?? null, name: c.name }, null)]));
  const roleOf = (c: CampaignInfo): { role: Role; source: RoleSource } =>
    c.level === undefined || c.level === "campaign"
      ? campaignRoles.get(c.id) ?? resolveRole({ role: c.role ?? null, name: c.name }, null)
      : resolveRole({ role: null, name: c.name }, c.campaignId ? campaignRoles.get(c.campaignId) ?? null : null, c.level === "ad" ? c.parentName : null);

  // Rows for one level (campaign / ad set / ad). Each row is judged against its
  // target, its own previous period, and its peers: same objective, platform,
  // funnel role and level.
  function buildRows(level: EntityLevel, infos: Map<string, CampaignInfo>, key: (f: FactRow) => string | null | undefined): CampaignRow[] {
    const byB = aggregate(input.factsB, key, input.columns);
    const byBM = hasImmature ? aggregate(matureB, key, input.columns) : null;
    const byA = aggregate(input.factsA, key, input.columns);
    const byH = aggregate(input.factsHistory ?? [], key, input.columns);
    const hRange = new Map<string, { from: string; to: string }>();
    for (const f of input.factsHistory ?? []) {
      const k = key(f);
      if (!k) continue;
      const r = hRange.get(k);
      hRange.set(k, { from: r && r.from < f.periodStart ? r.from : f.periodStart, to: r && r.to > f.periodEnd ? r.to : f.periodEnd });
    }

    // Peer groups per objective × platform: summed measures, so spend-weighted.
    const groups = new Map<string, { m: Measures; n: number }>();
    const objSpend = new Map<Objective, number>();
    for (const [id, x] of byB) {
      const c = infos.get(id);
      if (!c) continue;
      objSpend.set(c.objective, (objSpend.get(c.objective) ?? 0) + x.m.spend);
      if (x.m.spend <= 0) continue;
      const k = `${c.objective}|${c.platform}|${roleOf(c).role}`;
      const g = groups.get(k) ?? { m: emptyMeasures(), n: 0 };
      groups.set(k, { m: sumMeasures([g.m, x.m]), n: g.n + 1 });
    }

    const out: CampaignRow[] = [];
    for (const id of new Set([...byB.keys(), ...byA.keys()])) {
      const c = infos.get(id);
      if (!c) continue;
      const xb = byB.get(id);
      const xa = byA.get(id);
      const b = xb?.m ?? emptyMeasures();
      const aRaw = xa?.m ?? null;
      const a = aRaw ? scaleMeasures(aRaw, scaleA) : null;
      // Keep active items with zero delivery: "active but not spending" is a finding.
      if (b.spend <= 0 && b.impressions <= 0 && !(aRaw && aRaw.spend > 0) && !isRunning(c.status)) continue;
      const availB: Avail = xb?.avail ?? xa?.avail ?? ALL_MEASURES;
      const availA: Avail | null = xa ? aAvail(xa.avail) : null;
      const mode = chooseMode(c.objective, b, a, availB, availA);
      const okB = kpiAvailable(c.objective, mode, availB);
      const okA = !!availA && kpiAvailable(c.objective, mode, availA);
      const kpiB = okB ? kpiValue(b, c.objective, mode) : null;
      const kpiA = a && okA ? kpiValue(a, c.objective, mode) : null;
      const change = kpiA && kpiB !== null ? kpiB / kpiA - 1 : null;
      const confidence: Confidence = aRaw && kpiA !== null && kpiB !== null ? changeConfidence(c.objective, mode, aRaw, b) : levelConfidence(c.objective, b, mode);
      const goal = goalYardstick(goalsByObj.get(c.objective), mode);
      const be = breakEven(goalsByObj.get(c.objective), mode);
      // Similar items, excluding this one, and only when there are enough of them.
      const role = roleOf(c);
      const g = groups.get(`${c.objective}|${c.platform}|${role.role}`);
      const self = b.spend > 0 ? b : emptyMeasures();
      const peerCount = g ? g.n - (b.spend > 0 ? 1 : 0) : 0;
      const others = g && peerCount >= MIN_PEERS ? sumMeasures([g.m, scaleMeasures(self, -1)]) : null;
      const peerKpi = others && okB ? kpiValue(others, c.objective, mode) : null;
      // Still learning: the platform says so, or it started less than 7 days before the end of the period.
      const learning = c.status === "learning" || (input.coverage.hasDaily && c.firstSeen > addDays(selection.b.to, -7));
      const base = {
        info: c, level, mode, a, aRaw, b, availB, availA, kpiA, kpiB, change, confidence, goal, breakEven: be,
        piGoal: performanceIndex(kpiB, goal?.value ?? null, mode),
        piTrend: performanceIndex(kpiB, kpiA, mode),
        piPeer: performanceIndex(kpiB, peerKpi, mode),
        peerKpi,
        peerCount: peerKpi !== null ? peerCount : 0,
        spendShare: (objSpend.get(c.objective) ?? 0) > 0 ? b.spend / objSpend.get(c.objective)! : 0,
        learning,
        isNew: hasComparisonData && b.spend > 0 && !(aRaw && aRaw.spend > 0),
        isStopped: !!aRaw && aRaw.spend > 0 && b.spend <= 0,
        history: byH.has(id) && byH.get(id)!.m.spend > 0 ? { m: byH.get(id)!.m, avail: byH.get(id)!.avail, ...hRange.get(id)! } : null,
        role: role.role,
        roleSource: role.source,
        bMature: byBM && (byBM.get(id)?.rows ?? 0) < (xb?.rows ?? 0) ? byBM.get(id)?.m ?? emptyMeasures() : null,
      };
      const v = verdictFor(base, currency);
      out.push({ ...base, verdict: learning && v.verdict !== "critical" ? "learning" : v.verdict, reason: v.reason });
    }
    return out.sort((x, y) => y.b.spend - x.b.spend);
  }

  // ---------- campaign, ad set and ad rows ----------
  const rows = buildRows("campaign", info, (f) => f.campaignId);
  const lower = input.entities ?? [];
  const byLevel = {
    ad_group: buildRows("ad_group", new Map(lower.filter((e) => e.level === "ad_group").map((e) => [e.id, e])), (f) => f.adGroupId),
    ad: buildRows("ad", new Map(lower.filter((e) => e.level === "ad").map((e) => [e.id, e])), (f) => f.adId),
  };

  // ---------- objective summaries ----------
  const totalB = input.factsB.reduce((s, f) => s + f.measures.spend, 0);
  const objAggB = aggregate(input.factsB, (f) => info.get(f.campaignId)?.objective, input.columns);
  const objAggA = aggregate(input.factsA, (f) => info.get(f.campaignId)?.objective, input.columns);
  const objAggH = aggregate(input.factsHistory ?? [], (f) => info.get(f.campaignId)?.objective, input.columns);
  const objAggBM = hasImmature ? aggregate(matureB, (f) => info.get(f.campaignId)?.objective, input.columns) : null;
  const objectives: ObjectiveSummary[] = [];
  for (const objective of OBJECTIVES) {
    const objRows = rows.filter((r) => r.info.objective === objective);
    if (objRows.length === 0) continue;
    const xb = objAggB.get(objective) ?? mergeAggs([]);
    const xa = hasComparisonData ? objAggA.get(objective) ?? null : null;
    const b = xb.m;
    const aRaw = xa && xa.m.spend > 0 ? xa.m : null;
    const a = aRaw ? scaleMeasures(aRaw, scaleA) : null;
    if (b.spend <= 0 && !aRaw) continue;
    const availB: Avail = objAggB.has(objective) ? xb.avail : ALL_MEASURES;
    const availA: Avail | null = xa && aRaw ? aAvail(xa.avail) : null;
    const mode = chooseMode(objective, b, a, availB, availA);
    const okB = kpiAvailable(objective, mode, availB);
    const okA = !!availA && kpiAvailable(objective, mode, availA);
    const kpiB = okB ? kpiValue(b, objective, mode) : null;
    const kpiA = a && okA ? kpiValue(a, objective, mode) : null;
    const goal = goalYardstick(goalsByObj.get(objective), mode);
    objectives.push({
      objective,
      mode,
      a,
      aRaw,
      b,
      availB,
      kpiMissing: !okB,
      spendShare: totalB > 0 ? b.spend / totalB : 0,
      kpiA,
      kpiB,
      change: kpiA && kpiB !== null ? kpiB / kpiA - 1 : null,
      confidence: aRaw && kpiA !== null && kpiB !== null ? changeConfidence(objective, mode, aRaw, b) : levelConfidence(objective, b, mode),
      goal,
      breakEven: breakEven(goalsByObj.get(objective), mode),
      piGoal: performanceIndex(kpiB, goal?.value ?? null, mode),
      decomposition: a && okA && okB ? decompose(objective, mode, a, b) : null,
      supporting: SUPPORTING[objective].map((key) => {
        const def = METRICS[key];
        const hasB = metricAvailable(key, objective, availB);
        const hasA = !!availA && metricAvailable(key, objective, availA);
        const vb = hasB ? def.compute(b, objective) : null;
        const va = a && hasA ? def.compute(a, objective) : null;
        return {
          key,
          label: metricLabelFor(key, objective),
          unit: def.unit,
          polarity: def.polarity,
          a: va,
          b: vb,
          change: va && vb !== null ? vb / va - 1 : null,
          missing: !hasB,
        };
      }),
      campaignCount: objRows.filter((r) => r.b.spend > 0).length,
      history: (objAggH.get(objective)?.m.spend ?? 0) > 0 ? objAggH.get(objective)!.m : null,
      bMature: objAggBM && (objAggBM.get(objective)?.rows ?? 0) < xb.rows ? objAggBM.get(objective)?.m ?? emptyMeasures() : null,
    });
  }
  objectives.sort((x, y) => y.b.spend - x.b.spend);

  // ---------- platforms ----------
  const platB = aggregate(input.factsB, (f) => f.platform);
  const platA = aggregate(input.factsA, (f) => f.platform);
  const platforms: PlatformSummary[] = [...new Set([...platB.keys(), ...platA.keys()])]
    .map((p) => ({
      platform: p as Platform,
      spendB: platB.get(p)?.m.spend ?? 0,
      spendA: hasComparisonData ? (platA.get(p)?.m.spend ?? 0) * scaleA : null,
      share: totalB > 0 ? (platB.get(p)?.m.spend ?? 0) / totalB : 0,
    }))
    .filter((p) => p.spendB > 0 || (p.spendA ?? 0) > 0)
    .sort((x, y) => y.spendB - x.spendB);

  // ---------- daily series ----------
  const daily: Analysis["daily"] = [];
  for (const o of objectives) {
    const byDay = aggregate(
      input.recentDaily.filter((f) => info.get(f.campaignId)?.objective === o.objective),
      (f) => f.periodStart,
    );
    const points: DailyPoint[] = [...byDay.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([date, x]) => ({ date, measures: x.m }));
    if (points.length) daily.push({ objective: o.objective, points });
  }

  const totalA = hasComparisonData ? input.factsA.reduce((s, f) => s + f.measures.spend, 0) * scaleA : null;
  const partial: Omit<Analysis, "findings" | "goalStatus" | "dataNotes" | "done" | "decisions"> = {
    workspace,
    selection,
    coverage: input.coverage,
    totals: { spendA: totalA, spendB: totalB, change: totalA ? totalB / totalA - 1 : null },
    objectives,
    platforms,
    campaigns: rows,
    byLevel,
    changes: {
      started: rows.filter((r) => r.isNew).map((r) => r.info.name),
      stopped: rows.filter((r) => r.isStopped).map((r) => r.info.name),
    },
    daily,
    hasComparisonData,
    goals: input.goals,
  };
  const findings = detect(partial, input.recentDaily);
  return {
    ...partial,
    findings,
    goalStatus: computeGoalStatus(partial),
    dataNotes: computeDataNotes(partial, input),
    done: [],
    decisions: {},
  };
}
