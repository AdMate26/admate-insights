import Link from "next/link";
import { UndoImportButton } from "@/components/UndoImportButton";
import { ButtonLink, Card } from "@/components/ui";
import { previousReport } from "@/lib/analysis/periods";
import { getCoverage, listImports, requireWorkspace } from "@/lib/data/workspaces";
import type { ImportDiff } from "@/lib/data/imports";
import { money, rangeLabel } from "@/lib/format";
import { PLATFORM_LABEL, type Platform } from "@/lib/ingest/headers";
import { BREAKDOWN_LABEL, type BreakdownKind } from "@/lib/ingest/breakdown";

export const metadata = { title: "Reports" };

// Every uploaded report: open it on the dashboard, compare it with the one
// before, or undo it.
export default async function ReportsPage({ params }: PageProps<"/c/[ws]/reports">) {
  const { ws } = await params;
  const workspace = await requireWorkspace(ws);
  const [history, coverage] = await Promise.all([listImports(ws), getCoverage(ws)]);
  const cur = workspace.currency;
  const live = new Map(coverage.reports.map((r) => [r.importId, r]));
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Reports</p>
          <h1 className="mt-1 text-2xl">Your uploaded reports</h1>
          <p className="mt-1 text-sm text-muted">Open a report to see its alerts and recommendations, or compare it with the report before it.</p>
        </div>
        <ButtonLink href={`/c/${ws}/upload`}>Upload report</ButtonLink>
      </div>
      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No reports yet.</p>
      ) : (
        <Card className="p-5">
          <ul className="divide-y divide-line">
            {history.map((h) => {
              const diff = h.diff as ImportDiff | null;
              const report = live.get(h.id);
              const bd = h.kind !== "performance" ? BREAKDOWN_LABEL[h.kind as BreakdownKind] : null;
              const prev = report ? previousReport(report, coverage.reports) : null;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.fileName}</div>
                    <div className="text-xs text-muted">
                      {PLATFORM_LABEL[h.platform as Platform]} · {rangeLabel(h.periodStart, h.periodEnd)} · {h.granularity === "daily" ? "daily rows" : "period totals"} · {h.rowCount} rows
                      {h.status === "undone" && " · undone"}
                      {bd && ` · breakdown: ${bd} (Audience insight)`}
                      {h.status === "active" && !report && !bd && " · replaced by a newer upload"}
                    </div>
                    {diff && h.status === "active" && (
                      <div className="text-xs text-muted">
                        Replaced {diff.replaced.map((r) => r.fileName).join(", ")} for the overlapping dates (spend {money(diff.before.spend, cur)} → {money(diff.after.spend, cur)}).
                      </div>
                    )}
                  </div>
                  {report && (
                    <Link href={`/c/${ws}?report=${h.id}&vs=none`} className="text-xs font-medium text-violet hover:underline">
                      Open
                    </Link>
                  )}
                  {report && prev && (
                    <Link href={`/c/${ws}?report=${h.id}&vs=${prev.importId}`} className="text-xs font-medium text-violet hover:underline">
                      Compare with {rangeLabel(prev.from, prev.to)}
                    </Link>
                  )}
                  {bd && h.status === "active" && (
                    <Link href={`/c/${ws}/audience?bd=${h.kind}`} className="text-xs font-medium text-violet hover:underline">
                      Open in Audience insight
                    </Link>
                  )}
                  {h.status === "active" && <UndoImportButton workspaceId={ws} importId={h.id} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
