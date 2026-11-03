import Link from "next/link";
import { UndoImportButton } from "@/components/UndoImportButton";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { previousReport } from "@/lib/analysis/periods";
import { getCoverage, listImports, requireWorkspace } from "@/lib/data/workspaces";
import type { ImportDiff } from "@/lib/data/imports";
import { money, rangeLabel } from "@/lib/format";
import { PLATFORM_LABEL, type Platform } from "@/lib/ingest/headers";
import { BREAKDOWN_LABEL, type BreakdownKind } from "@/lib/ingest/breakdown";
import { KEEP_RECENT_SYNCS, syncImportsOf } from "@/lib/tiktok/history";

export const metadata = { title: "Reports" };

// Every uploaded report (prototype reportsHtml): open it with no comparison, compare
// it with the report before it, or undo it.
export default async function ReportsPage({ params }: PageProps<"/c/[ws]/reports">) {
  const { ws } = await params;
  const workspace = await requireWorkspace(ws);
  const [all, coverage, syncs] = await Promise.all([listImports(ws), getCoverage(ws), syncImportsOf(ws)]);
  const cur = workspace.currency;
  const live = new Map(coverage.reports.map((r) => [r.importId, r]));
  // Older TikTok syncs are kept as history (their numbers stay in the analysis):
  // shown as one line instead of one entry per sync.
  const history = all.filter((h) => h.status !== "history");
  const older = all.filter((h) => h.status === "history");
  const active = history.filter((h) => h.status === "active" && !syncs.has(h.id)).length;
  const recentSyncs = history.filter((h) => h.status === "active" && syncs.has(h.id)).length;
  return (
    <V5Page vm={null} page="reports">
      <PageHead title="Reports" withPeriod={false} />
      <div className="page">
        <section className="section">
          <header>
            <h2>Reports</h2>
            <span className="hint">
              {active} {active === 1 ? "report" : "reports"} uploaded for this account
              {recentSyncs > 0 && ` · ${recentSyncs} recent TikTok ${recentSyncs === 1 ? "sync" : "syncs"}`}
            </span>
            <span className="more">
              <Link className="btn primary" href={`/c/${ws}/upload`}>
                Upload report
              </Link>
            </span>
          </header>
          {all.length === 0 ? (
            <div className="empty">
              <b>No reports yet</b>Upload an export from your ads manager to start.
            </div>
          ) : (
            <div className="list">
              {history.map((h) => {
                const diff = h.diff as ImportDiff | null;
                const report = live.get(h.id);
                const bd = h.kind !== "performance" ? BREAKDOWN_LABEL[h.kind as BreakdownKind] : null;
                const prev = report ? previousReport(report, coverage.reports) : null;
                return (
                  <div key={h.id} className="li">
                    <div className="grow">
                      <b>{h.fileName}</b>
                      <span>
                        {PLATFORM_LABEL[h.platform as Platform]} · {rangeLabel(h.periodStart, h.periodEnd)} · {h.granularity === "daily" ? "daily rows" : "period totals"} · {h.rowCount} rows
                        {h.status === "undone" && " · undone"}
                        {bd && ` · breakdown: ${bd} (Audience insight)`}
                        {h.status === "active" && !report && !bd && " · replaced by a newer upload"}
                      </span>
                      {diff && h.status === "active" && (
                        <span>
                          Replaced {diff.replaced.map((r) => r.fileName).join(", ")} for the overlapping dates (spend {money(diff.before.spend, cur)} → {money(diff.after.spend, cur)}).
                        </span>
                      )}
                    </div>
                    {report && (
                      <Link className="btn small" href={`/c/${ws}?report=${h.id}&vs=none`}>
                        Open this report
                      </Link>
                    )}
                    {report && prev && (
                      <Link className="btn small" href={`/c/${ws}?report=${h.id}&vs=${prev.importId}`}>
                        Compare with {rangeLabel(prev.from, prev.to)}
                      </Link>
                    )}
                    {bd && h.status === "active" && (
                      <Link className="btn small" href={`/c/${ws}/audience?bd=${h.kind}`}>
                        Open in Audience insight
                      </Link>
                    )}
                    {h.status === "active" && <UndoImportButton workspaceId={ws} importId={h.id} />}
                  </div>
                );
              })}
              {older.length > 0 && (
                <div className="li">
                  <div className="grow">
                    <b>TikTok sync history</b>
                    <span>
                      {older.length} earlier {older.length === 1 ? "sync" : "syncs"} · {rangeLabel(older.reduce((m, h) => (h.periodStart < m ? h.periodStart : m), older[0].periodStart), older.reduce((m, h) => (h.periodEnd > m ? h.periodEnd : m), older[0].periodEnd))} ·
                      their numbers stay in your analysis. Only the {KEEP_RECENT_SYNCS} latest syncs can be undone.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="small-note">“Open” shows everything in the report with no comparison. “Undo” removes an upload; anything it replaced comes back.</p>
        </section>
      </div>
    </V5Page>
  );
}
