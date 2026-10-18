import { addDays } from "@/lib/dates";
import { money, num } from "@/lib/format";
import { WEEKDAYS } from "@/lib/dates";
import { dailyFacts, entitySeries, rowOf, type InsightView, type Item, type Series } from "@/lib/analysis/insights";
import type { Analysis } from "@/lib/analysis/types";
import { loadEntityDaily } from "@/lib/data/workspaces";
import { ConfDots, fmtKpi, KindTag, PathCrumbs, Plat, PrioChip, type Kind } from "./bits";
import { DailyChart, fmtDay } from "./charts";
import { DecisionBar, DrawerShell } from "./DrawerClient";

// Everything about one item: priority vs confidence, what happened, day by day,
// what it cost, evidence, likely cause, what to do, and the decision buttons.
export async function ItemDrawer({ a, view, itemKey, closeHref }: { a: Analysis; view: InsightView; itemKey: string; closeHref: string }) {
  const d = view.find(itemKey);
  if (!d) return null;
  const cur = a.workspace.currency;
  let series: Series | null = null;
  const row = d.entity ? rowOf(a, d.entity) : undefined;
  if (d.entity && row && a.coverage.hasDaily) {
    const start = view.from < addDays(view.to, -27) ? view.from : addDays(view.to, -27);
    series = entitySeries(await loadEntityDaily(a.workspace.id, d.entity.level, d.entity.id, start, view.to), row, view.from, view.to);
  }
  return <DrawerBody d={d} view={view} series={series} cur={cur} workspaceId={a.workspace.id} closeHref={closeHref} />;
}

function DrawerBody({ d, view, series, cur, workspaceId, closeHref }: { d: Item; view: InsightView; series: Series | null; cur: string; workspaceId: string; closeHref: string }) {
  const cause = d.whyHappening[0];
  const rest = d.whyHappening.slice(1);
  const recheck = d.whatToDo.find((s) => /^Re-check/.test(s));
  const steps = d.whatToDo.filter((s) => s !== recheck);
  const prReason = d.priorityReason.replace(/^(High|Medium|Low)( instead of high)?: /, "");
  const kind: Kind = d.bucket === "problem" ? "issue" : d.bucket === "opportunity" ? "opportunity" : d.kind;
  const facts = series ? dailyFacts(series, view.from, view.to) : null;
  // The headline amount of "What it cost you": the first $ in "You paid …", or the lost revenue.
  const amounts = d.cost?.match(/\$[\d,]+(\.\d+)?/g) ?? [];
  const costAmount = d.cost ? (/^You paid/.test(d.cost) ? amounts[0] : /would have brought/.test(d.cost) ? amounts[amounts.length - 2] : null) : null;
  return (
    <DrawerShell closeHref={closeHref} labelledBy="drawer-title">
      <header className="border-b border-line px-5 pb-4 pr-24 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <PrioChip p={d.priority} />
          <KindTag k={kind} />
          <Plat p={d.platform} />
        </div>
        <h3 id="drawer-title" className="mt-2 text-xl leading-snug">
          {d.title}
        </h3>
        {d.where && (
          <div className="mt-1">
            <PathCrumbs where={d.where} />
          </div>
        )}
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 font-medium">
              Priority: <PrioChip p={d.priority} />
            </div>
            <p className="mt-1 text-xs text-muted">How much it matters now. {prReason}</p>
          </div>
          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 font-medium">
              Confidence: <ConfDots c={d.confidence} /> {d.confidence}
            </div>
            <p className="mt-1 text-xs text-muted">How sure AdMate is about the numbers. {d.confidenceText.replace(/^\w+ — /, "")}</p>
          </div>
        </div>

        <Block title="What happened">
          <p>{d.description}</p>
          {d.note && <p className="mt-1 text-xs text-muted">ⓘ {d.note}</p>}
        </Block>

        {series && (
          <Block title="Day by day">
            <DailyChart series={series} from={view.from} to={view.to} currency={cur} />
            {facts && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Fact label="Best day" value={fmtDay(facts.best.date)} sub={`${num(facts.best.results)} ${series.resultLabel}`} />
                {facts.cheapest && <Fact label={`${series.mode === "roas" ? "Highest" : "Cheapest"} ${series.kpiShort}`} value={fmtDay(facts.cheapest.date)} sub={fmtKpi(facts.cheapest.kpi, series.mode, cur)} />}
                <Fact label="Best weekday (average, 4 weeks)" value={WEEKDAYS[facts.bestWeekday.i]} sub={`${facts.bestWeekday.avg.toFixed(1)} ${series.resultLabel} a day`} />
                <Fact label="Total in period" value={num(facts.total)} sub={`${series.resultLabel} over ${facts.days} day${facts.days === 1 ? "" : "s"}`} />
              </div>
            )}
          </Block>
        )}

        {d.cost && (
          <Block title="What it cost you">
            <div className="rounded-lg bg-surface p-3">
              {costAmount && (
                <div className="num text-xl font-medium">
                  {costAmount} {/would have brought/.test(d.cost) ? "less revenue" : "extra"}
                </div>
              )}
              <p className="mt-1">{d.cost}</p>
              <p className="mt-1 text-xs text-muted">Calculated from your own numbers in {view.label} and {view.compareLabel ?? "the period before"}. It’s money the change already cost, not a forecast.</p>
            </div>
          </Block>
        )}

        {d.evidence.length > 0 && (
          <Block title="Evidence">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label border-b border-line text-left">
                    <th className="py-1.5 pr-3 font-normal">Metric</th>
                    <th className="py-1.5 pr-3 text-right font-normal">{view.compareLabel ?? "Before"}</th>
                    <th className="py-1.5 text-right font-normal">{view.label}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.evidence.map((e) => (
                    <tr key={e.label}>
                      <td className="py-1.5 pr-3">{e.label}</td>
                      <td className="num py-1.5 pr-3 text-right text-muted">{e.a ?? "—"}</td>
                      <td className="num py-1.5 text-right">{e.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        )}

        {cause && (
          <Block title="Likely cause">
            <p className="text-xs italic text-muted">A hypothesis from the numbers, not a confirmed cause.</p>
            <p className="mt-1">{cause}</p>
            {rest.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted">More context ({rest.length})</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {rest.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </Block>
        )}

        <Block title="What to do">
          <ol className="list-decimal space-y-1 pl-5">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Block>

        {(d.risk || recheck || d.monitor.length > 0) && (
          <Block title="Risk and re-check">
            {d.risk && <p>{d.risk}</p>}
            {recheck && <p className="mt-1">{recheck}</p>}
            {d.monitor.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                {d.monitor.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Block>
        )}

        {d.cantTell.length > 0 && (
          <div className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-warn">
            <b className="font-medium">What this report can’t tell us.</b> {d.cantTell.join(" ")}
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer font-medium">How AdMate judged this</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {d.judgedBy.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
        <p className="text-xs text-muted">
          Spend on this item: <span className="num">{money(d.stake, cur)}</span> ({Math.round(d.share * 100)}% of all spend in {view.label}).
        </p>
      </div>
      <DecisionBar workspaceId={workspaceId} itemKey={d.key} title={d.title} status={d.status} until={d.until} dismissReason={d.dismissReason} closeHref={closeHref} />
    </DrawerShell>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="label mb-1.5 !text-fg">{title}</h4>
      {children}
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-medium">{value}</div>
      <div className="num text-xs text-muted">{sub}</div>
    </div>
  );
}
