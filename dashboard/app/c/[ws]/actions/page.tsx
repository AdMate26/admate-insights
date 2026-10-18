import Link from "next/link";
import { EmptyData } from "@/components/EmptyData";
import { PeriodBar, selectionParams } from "@/components/PeriodBar";
import { Legend, Section } from "@/components/v3/bits";
import { ItemDrawer } from "@/components/v3/ItemDrawer";
import { ItemRow } from "@/components/v3/ItemRow";
import { one, withParams } from "@/components/v3/links";
import { cx } from "@/components/ui";
import { insightView, isOpenStatus, type Item } from "@/lib/analysis/insights";
import { loadAnalysis } from "@/lib/data/workspaces";

export const metadata = { title: "Actions" };

const FILTERS = { problem: "Problems", opportunity: "Opportunities", signal: "Monitoring", done: "Done & reminders" } as const;
type Filter = keyof typeof FILTERS;

// One list: every problem and opportunity appears once, with the campaign, ad set
// and ad it belongs to. Replaces the separate Alerts and Recommendations pages.
export default async function ActionsPage({ params, searchParams }: PageProps<"/c/[ws]/actions">) {
  const { ws } = await params;
  const sp = await searchParams;
  const a = await loadAnalysis(ws, await selectionParams(searchParams));
  if (!a) return <EmptyData workspaceId={ws} />;
  const v = insightView(a);
  const all = [...v.problems, ...v.opportunities, ...v.signals];
  const closed = (d: Item) => !isOpenStatus(d.status);
  const groups: Record<Filter, Item[]> = {
    problem: v.problems.filter((d) => !closed(d)),
    opportunity: v.opportunities.filter((d) => !closed(d)),
    signal: v.signals.filter((d) => !closed(d)),
    done: all.filter(closed).filter((d, i, arr) => arr.findIndex((x) => x.key === d.key) === i),
  };
  const f = one(sp, "filter");
  const filter: Filter = f && f in FILTERS ? (f as Filter) : groups.problem.length > 0 ? "problem" : groups.opportunity.length > 0 ? "opportunity" : "problem";
  const list = groups[filter];
  const empty: Record<Filter, string> = {
    problem: `No open problems in ${v.label}.`,
    opportunity: "No open opportunities.",
    signal: "Nothing to watch in this period. Early signals land here when a change isn’t confirmed yet.",
    done: "Nothing yet. Open any item and choose Action taken, Remind me later or Dismiss.",
  };
  const openKey = one(sp, "open");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="label">Actions</p>
        <h1 className="mt-1 text-2xl">{a.workspace.name}</h1>
      </div>
      <PeriodBar selection={a.selection} coverage={a.coverage} hasPeriodData={a.totals.spendB > 0 || a.campaigns.some((c) => c.b.impressions > 0)} hasComparisonData={a.hasComparisonData} />
      {a.dataNotes
        .filter((n) => n.level === "warn")
        .map((n) => (
          <p key={n.key} className="rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn" role="status">
            {n.text}
          </p>
        ))}
      <Section title="Actions" hint="One list. Every problem and opportunity appears once, with the campaign, ad set and ad it belongs to. Open one for its analysis and daily chart.">
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {(Object.keys(FILTERS) as Filter[]).map((k) => (
            <Link key={k} href={withParams(sp, { filter: k, open: null })} scroll={false} aria-current={k === filter ? "true" : undefined} className={cx("rounded-full border px-3 py-1 text-sm", k === filter ? "border-violet bg-violet-soft text-violet" : "border-line text-muted hover:text-fg")}>
              {FILTERS[k]} <span className="num ml-1">{groups[k].length}</span>
            </Link>
          ))}
        </div>
        <Legend />
        {list.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            {list.map((d, i) => (
              <ItemRow key={d.key} d={d} href={withParams(sp, { open: d.key })} start={filter === "problem" && i === 0} currency={a.workspace.currency} />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{empty[filter]}</p>
        )}
      </Section>
      {openKey && <ItemDrawer a={a} view={v} itemKey={openKey} closeHref={withParams(sp, { open: null })} />}
    </div>
  );
}
