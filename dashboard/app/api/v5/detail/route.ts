import { loadView } from "@/lib/data/view";

// The full detail of one item (an ad set's or ad's plan) for the account and period
// in the query string: the item panel loads it when opened. Only the signed-in
// owner's accounts are read (loadView goes through getWorkspace).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const one = (k: string) => q.get(k) ?? undefined;
  const key = q.get("key") ?? "";
  if (!key || key.length > 300) return Response.json({ error: "Bad request" }, { status: 400 });
  const x = await loadView(q.get("ws") ?? "", { from: one("from"), to: one("to"), cmp: one("cmp"), cfrom: one("cfrom"), cto: one("cto"), report: one("report"), vs: one("vs") });
  const d = x ? (x.vm.details[key] ?? [...x.vm.problems, ...x.vm.opportunities, ...x.vm.signals, ...x.vm.closed].find((i) => i.key === key)) : null;
  return d ? Response.json(d, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "Not found" }, { status: 404 });
}
