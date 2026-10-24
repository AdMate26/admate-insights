import { seriesOf } from "@/lib/analysis/insights";
import { getWorkspace, loadEntityDaily } from "@/lib/data/workspaces";
import { addDays, isValidISO } from "@/lib/dates";
import { emptyMeasures, sumMeasures, type Measures } from "@/lib/metrics/measures";
import { OBJECTIVES, type KpiMode, type Objective } from "@/lib/metrics/objectives";

// Day-by-day numbers for one campaign / ad set / ad, ending on `to` (at least the 28
// days before it): the item panel's chart and the Compare chart. Only the signed-in
// owner's accounts are read.
const LEVELS = ["campaign", "ad_group", "ad"] as const;
const MODES: KpiMode[] = ["cost", "roas", "cpm"];

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const ws = q.get("ws") ?? "";
  const level = q.get("level") as (typeof LEVELS)[number];
  const id = q.get("id") ?? "";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const objective = q.get("objective") as Objective;
  const mode = q.get("mode") as KpiMode;
  if (!LEVELS.includes(level) || !id || !isValidISO(from) || !isValidISO(to) || from > to || !OBJECTIVES.includes(objective) || !MODES.includes(mode))
    return Response.json({ error: "Bad request" }, { status: 400 });
  if (!(await getWorkspace(ws))) return Response.json({ error: "Not found" }, { status: 404 });
  const start = from < addDays(to, -27) ? from : addDays(to, -27);
  const facts = await loadEntityDaily(ws, level, id, start, to);
  const by = new Map<string, Measures>();
  for (const f of facts) by.set(f.periodStart, sumMeasures([by.get(f.periodStart) ?? emptyMeasures(), f.measures]));
  const points: { date: string; measures: Measures }[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) points.push({ date: d, measures: by.get(d) ?? emptyMeasures() });
  return Response.json(seriesOf(points, objective, mode), { headers: { "cache-control": "no-store" } });
}
