import { badgeCounts } from "@/lib/analysis/insights";
import { loadAnalysis } from "@/lib/data/workspaces";

// Sidebar badge counts for the account and the period in the query string, so
// the badges match the page the user is looking at.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const one = (k: string) => url.searchParams.get(k) ?? undefined;
  const a = await loadAnalysis(url.searchParams.get("ws") ?? "", { from: one("from"), to: one("to"), cmp: one("cmp"), cfrom: one("cfrom"), cto: one("cto"), report: one("report"), vs: one("vs") });
  return Response.json(a ? badgeCounts(a) : { actions: 0 }, { headers: { "cache-control": "no-store" } });
}
