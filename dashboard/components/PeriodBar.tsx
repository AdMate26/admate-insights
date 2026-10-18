import Link from "next/link";
import { Suspense } from "react";
import { explainEmpty, type Coverage, type Preset, type Selection } from "@/lib/analysis/periods";
import { addDays, rangeDays } from "@/lib/dates";
import { rangeLabel } from "@/lib/format";
import { PeriodPicker } from "./v3/PeriodPicker";

// The period picker plus one plain line on what is being compared with what.
export function PeriodBar({
  selection,
  coverage,
  hasPeriodData,
  hasComparisonData,
}: {
  selection: Selection;
  coverage: Coverage;
  hasPeriodData: boolean;
  hasComparisonData: boolean;
}) {
  // Explain an empty period (most often: a single day inside a monthly upload).
  const byReport = selection.mode === "reports";
  const empty = byReport
    ? null
    : !hasPeriodData
      ? explainEmpty(selection.b, coverage, "period")
      : selection.a && !hasComparisonData
        ? explainEmpty(selection.a, coverage, "comparison")
        : null;
  const s = selection;
  const days = rangeDays(s.b.from, s.b.to);
  const compared = !!s.a && hasComparisonData;
  const histEnd = addDays(compared && s.a!.from < s.b.from ? s.a!.from : s.b.from, -1);
  const history = coverage.minDate && coverage.minDate <= histEnd && !byReport ? rangeLabel(coverage.minDate, histEnd) : null;
  const how = s.mode === "previous" ? (days === 1 ? "the day before" : "the same number of days right before") : s.mode === "reports" ? "the report you picked" : "the period you chose";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">
          {compared ? (
            <>
              Showing <b className="font-medium text-fg">{s.label}</b> ({days} day{days === 1 ? "" : "s"}). Every ▲▼ change compares it with <b className="font-medium text-fg">{s.compareLabel}</b> ({how})
              {s.normalized && ", per day because the two periods have different lengths"}.
              {history && (
                <>
                  {" "}
                  Before suggesting “put more money in” or “cut”, AdMate also checks the change against the older history (<b className="font-medium text-fg">{history}</b>).
                </>
              )}
            </>
          ) : (
            <>
              Showing <b className="font-medium text-fg">{s.label}</b> with <b className="font-medium text-fg">no comparison</b>
              {s.a && hasPeriodData && <span className="text-warn"> (no data for {s.compareLabel} yet)</span>}.{" "}
              {history ? (
                <>
                  Campaigns are judged against their own results before this period (<b className="font-medium text-fg">{history}</b>), then your targets.
                </>
              ) : (
                "Campaigns are judged against your targets and against each other."
              )}
            </>
          )}
          {days === 1 && " One day is for exploring only: no budget calls on a single day."}
          {!byReport && !coverage.hasDaily && " Your uploads are period totals (no daily breakdown)."}
        </p>
        <Suspense>
          <PeriodPicker selection={selection} reports={coverage.reports} minDate={coverage.minDate} maxDate={coverage.maxDate} hasDaily={coverage.hasDaily} />
        </Suspense>
      </div>
      {empty && (
        <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm" role="status">
          <p>{empty.message}</p>
          {empty.suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {empty.suggestions.map((sg) => (
                <Link key={sg.label} href={`?${toQuery(sg)}`} className="rounded-full border border-line bg-bg px-2.5 py-1 text-xs hover:border-violet hover:text-violet">
                  {sg.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function toQuery(p: Preset): string {
  return new URLSearchParams(Object.entries(p.params).filter(([, v]) => v) as [string, string][]).toString();
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function selectionParams(sp: SearchParams) {
  const p = await sp;
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  return { from: one("from"), to: one("to"), cmp: one("cmp"), cfrom: one("cfrom"), cto: one("cto"), report: one("report"), vs: one("vs") };
}
