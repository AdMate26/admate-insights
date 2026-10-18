import { managerSummary } from "@/lib/ai/narrate";
import { loadAnalysis } from "@/lib/data/workspaces";

// "Summary report" for the account and period in the query string.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ws = url.searchParams.get("ws") ?? "";
  const one = (k: string) => url.searchParams.get(k) ?? undefined;
  const a = await loadAnalysis(ws, { from: one("from"), to: one("to"), cmp: one("cmp"), cfrom: one("cfrom"), cto: one("cto"), report: one("report"), vs: one("vs") });
  if (!a) return Response.json({ error: "No data for this account yet." }, { status: 404 });
  return Response.json(await managerSummary(a));
}
