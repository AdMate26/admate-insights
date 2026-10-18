import type { ReactNode } from "react";
import { managerSummaryFacts, managerSummaryText } from "@/lib/analysis/managerSummary";
import type { InsightView } from "@/lib/analysis/insights";
import type { Analysis } from "@/lib/analysis/types";
import { money } from "@/lib/format";
import { DeltaChip, fmtKpi } from "./bits";
import { DailyChart, GoalBullet } from "./charts";
import { CopyText, ModalShell, PrintButton } from "./SummaryClient";

const TONE: Record<string, "bad" | "warn" | "good" | "flat"> = { far_off: "bad", off_track: "warn", worse: "bad", on_track: "good", better: "good", flat: "flat", unknown: "flat" };

// "Summary report": a one-page visual update to share, built from the same numbers as the pages.
export function SummaryReport({ a, v, closeHref, bestAudience }: { a: Analysis; v: InsightView; closeHref: string; bestAudience?: string | null }) {
  const f = managerSummaryFacts(a);
  const cur = a.workspace.currency;
  const main = v.objectives[0];
  const great = v.great[0];
  return (
    <ModalShell closeHref={closeHref} labelledBy="report-title">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="label">Summary report</p>
          <h2 id="report-title" className="mt-1 text-xl">
            {f.title}
          </h2>
        </div>
        <div className="flex gap-2 pr-16 print:hidden">
          <CopyText text={managerSummaryText(f)} />
          <PrintButton />
        </div>
      </header>
      <div className="space-y-5 overflow-y-auto px-6 py-5 text-sm">
        <p className="text-[15px] font-medium">{f.headline}</p>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Tile k="Spend" v={money(v.spend, cur)} delta={<DeltaChip change={v.spendChange} mode="neutral" />} />
          {v.objectives.slice(0, 3).map((o) => (
            <Tile key={o.objective} k={`${o.label} · ${o.kpiShort}`} v={fmtKpi(o.value, o.mode, cur)} delta={<DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />} />
          ))}
        </div>
        {main && main.series.days.length > 1 && (
          <Part title={`${main.label}: the last ${main.series.days.length} days`}>
            <div className="rounded-xl border border-line p-3">
              <DailyChart series={main.series} from={v.from} to={v.to} currency={cur} height={190} />
            </div>
          </Part>
        )}
        <Part title="Goals">
          <div className="grid gap-3">
            {v.objectives.map((o) => (
              <div key={o.objective} className="grid gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{o.label}</span>
                  <span className="num ml-auto">
                    {o.kpiShort} {fmtKpi(o.value, o.mode, cur)}
                  </span>
                </div>
                <GoalBullet value={o.value} target={o.target} breakEven={o.breakEven} previous={v.compareLabel ? o.previous : null} tone={TONE[o.goal?.state ?? "unknown"]} label={o.label} />
                {o.goal && <span className="text-xs text-muted">{o.goal.headline}</span>}
              </div>
            ))}
          </div>
        </Part>
        <Part title="What changed">
          <List items={f.changes.length ? f.changes : ["No comparable earlier period yet."]} />
        </Part>
        <Part title="What’s working">
          <List
            items={[
              f.working ?? "Nothing stands out as a clear winner this period.",
              ...(great ? [`Consider more budget for ${great.campaign} (${great.kpi}).`] : []),
              ...(bestAudience ? [bestAudience] : []),
            ]}
          />
        </Part>
        <Part title="What I’m doing about it">
          <List items={f.doing.length ? f.doing : ["Nothing needs changing right now; keep monitoring."]} />
        </Part>
        {f.next.length > 0 && (
          <Part title="Next">
            <List items={f.next} />
          </Part>
        )}
        {f.caveats.length > 0 && (
          <Part title="Caveats">
            <List items={f.caveats} />
          </Part>
        )}
        <p className="text-xs text-muted">
          Written from your numbers for {v.label}
          {v.compareLabel ? ` vs ${v.compareLabel}` : ""}. Every figure comes from your uploaded reports.
        </p>
      </div>
    </ModalShell>
  );
}

function Tile({ k, v, delta }: { k: string; v: string; delta: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-xl border border-line p-3">
      <span className="text-xs text-muted">{k}</span>
      <span className="num text-xl font-medium">{v}</span>
      {delta}
    </div>
  );
}
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-base">{title}</h3>
      {children}
    </section>
  );
}
function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}
