import "server-only";
import { addSegs, AUDIENCE_TABS, audienceKpiShort, audienceMode, audienceResultLabel, audienceResults, judgeSegments, simulatedSplit, type AudienceBreakdown, type Seg } from "../analysis/audience";
import type { Analysis } from "../analysis/types";
import { addDays, weekday, WEEKDAYS } from "../dates";
import { rangeLabel } from "../format";
import { BREAKDOWN_LABEL } from "../ingest/breakdown";
import { OBJECTIVE_DEFS } from "../metrics/objectives";
import { loadBreakdowns, loadFacts } from "./workspaces";

// Audience insight for one set of campaigns ("obj:<goal>" or "c:<campaign>") and one
// breakdown: each group's share of spend and of results, its cost and a verdict.
// Day of week uses the daily data; the other breakdowns need a breakdown export
// (the sample account shows a clearly labelled simulated split of its real totals).
export async function loadAudience(a: Analysis, isSample: boolean, t: string | undefined, bdParam: string | undefined) {
  const ws = a.workspace.id;
  const b = a.selection.b;
  const spent = a.campaigns.filter((c) => c.b.spend > 0);
  const objectives = a.objectives.filter((o) => o.b.spend > 0).sort((x, y) => y.b.spend - x.b.spend).map((o) => o.objective);
  const targets = {
    objectives: objectives.map((o) => ({ objective: o, label: OBJECTIVE_DEFS[o].label })),
    campaigns: spent.map((c) => ({ id: c.info.id, name: c.info.name, objective: c.info.objective })),
  };
  const bd: AudienceBreakdown = AUDIENCE_TABS.some(([k]) => k === bdParam) ? (bdParam as AudienceBreakdown) : "age_gender";
  // Default: the biggest goal with enough results for groups to stand out.
  const valid = t && (t.startsWith("c:") ? spent.some((c) => `c:${c.info.id}` === t) : objectives.some((o) => `obj:${o}` === t));
  const enough = objectives.find((o) => o !== "awareness" && spent.filter((c) => c.info.objective === o).reduce((s, c) => s + audienceResults(c.b, o), 0) >= 200);
  const target = valid ? t! : objectives.length ? `obj:${enough ?? objectives[0]}` : "";
  const chosen = target.startsWith("c:") ? spent.filter((c) => `c:${c.info.id}` === target) : spent.filter((c) => `obj:${c.info.objective}` === target);
  if (!chosen.length) return { targets, target, bd, data: null };
  const o = chosen[0].info.objective;
  const mode = audienceMode(o);
  const ids = new Set(chosen.map((c) => c.info.id));
  let segs: Seg[] = [];
  let basis = "";
  let simulated = false;
  let unavailable = false;
  if (bd === "weekday") {
    const start = b.from < addDays(b.to, -27) ? b.from : addDays(b.to, -27);
    const acc = WEEKDAYS.map((name) => ({ name, spend: 0, results: 0 }));
    if (a.coverage.hasDaily)
      for (const f of await loadFacts(ws, start, b.to)) {
        if (f.granularity !== "daily" || !ids.has(f.campaignId)) continue;
        const d = acc[weekday(f.periodStart)];
        d.spend += f.measures.spend;
        d.results += audienceResults(f.measures, o);
      }
    segs = a.coverage.hasDaily ? [...acc.slice(1), acc[0]] : [];
    unavailable = !a.coverage.hasDaily;
    basis = `Real daily numbers, ${rangeLabel(start, b.to)}`;
  } else if (isSample) {
    for (const c of chosen) addSegs(segs, simulatedSplit(bd, c.info.name, c.info.platform, c.b.spend, audienceResults(c.b, o)));
    simulated = true;
    basis = `Simulated split of the real totals, ${rangeLabel(b.from, b.to)}`;
  } else {
    const got = await loadBreakdowns(ws, bd, b.from, b.to);
    const rows = got.rows.filter((r) => ids.has(r.campaignId));
    for (const r of rows) addSegs(segs, [{ name: r.segment, spend: r.measures.spend, results: audienceResults(r.measures, o) }]);
    unavailable = rows.length === 0;
    if (rows.length) {
      const from = rows.reduce((m, r) => (r.from < m ? r.from : m), rows[0].from);
      const to = rows.reduce((m, r) => (r.to > m ? r.to : m), rows[0].to);
      basis = `From your ${BREAKDOWN_LABEL[bd].toLowerCase()} export, ${rangeLabel(from, to)}${got.inPeriod ? "" : " (your newest one; it doesn’t cover the selected dates exactly)"}`;
    }
  }
  if (bd === "hour") segs.sort((x, y) => x.name.localeCompare(y.name));
  else if (bd !== "weekday") segs.sort((x, y) => y.spend - x.spend);
  const r = judgeSegments(segs, mode, bd);
  return {
    targets,
    target,
    bd,
    data: {
      objective: o,
      objectiveLabel: OBJECTIVE_DEFS[o].label,
      mode,
      resultLabel: audienceResultLabel(o),
      kpiShort: audienceKpiShort(o),
      spend: r.spend,
      results: r.results,
      avg: r.avg,
      rows: r.rows,
      basis,
      simulated,
      unavailable,
    },
  };
}
export type AudienceData = Awaited<ReturnType<typeof loadAudience>>;
