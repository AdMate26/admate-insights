import "server-only";
import { addSegs, audienceResults, simulatedSplit, type Seg } from "../analysis/audience";
import type { Analysis } from "../analysis/types";
import { rangeLabel } from "../format";
import { loadAudience } from "./audience";
import { loadBreakdowns } from "./workspaces";

// Geography: where the money went by location, across every campaign that spent,
// then how each location did for one goal (the Audience insight rows for location).
// Spend adds up across goals; results only within one goal, so they are per goal.
// The sample account uses the same clearly labelled simulated split as Audience.
export async function loadGeography(a: Analysis, isSample: boolean, t: string | undefined) {
  const b = a.selection.b;
  const spent = a.campaigns.filter((c) => c.b.spend > 0);
  const segs: Seg[] = [];
  let basis = "";
  let inPeriod = true;
  if (isSample) {
    for (const c of spent) addSegs(segs, simulatedSplit("location", c.info.name, c.info.platform, c.b.spend, audienceResults(c.b, c.info.objective)));
    basis = `Simulated split of the real totals, ${rangeLabel(b.from, b.to)}`;
  } else {
    const ids = new Set(spent.map((c) => c.info.id));
    const got = await loadBreakdowns(a.workspace.id, "location", b.from, b.to);
    const rows = got.rows.filter((r) => ids.has(r.campaignId));
    for (const r of rows) addSegs(segs, [{ name: r.segment, spend: r.measures.spend, results: 0 }]);
    inPeriod = got.inPeriod;
    if (rows.length) {
      const from = rows.reduce((m, r) => (r.from < m ? r.from : m), rows[0].from);
      const to = rows.reduce((m, r) => (r.to > m ? r.to : m), rows[0].to);
      basis = `From your location export, ${rangeLabel(from, to)}${got.inPeriod ? "" : " (your newest one; it doesn’t cover the selected dates exactly)"}`;
    }
  }
  const total = segs.reduce((s, x) => s + x.spend, 0);
  const places = segs
    .filter((x) => x.spend > 0)
    .sort((x, y) => y.spend - x.spend)
    .map((x) => ({ name: x.name, spend: x.spend, share: total > 0 ? x.spend / total : 0 }));
  const goal = await loadAudience(a, isSample, t, "location");
  return { total, places, basis, simulated: isSample, inPeriod, unavailable: places.length === 0, goal };
}
export type GeographyData = Awaited<ReturnType<typeof loadGeography>>;
