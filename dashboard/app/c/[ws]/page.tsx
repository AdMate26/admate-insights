import Link from "next/link";
import { EmptyData } from "@/components/EmptyData";
import { PeriodBar, selectionParams } from "@/components/PeriodBar";
import { cx } from "@/components/ui";
import { DeltaChip, fmtKpi, KindTag, Legend, Plat, PrioChip, Section } from "@/components/v3/bits";
import { DailyChart, GoalBullet, Spark } from "@/components/v3/charts";
import { ItemDrawer } from "@/components/v3/ItemDrawer";
import { ItemRow } from "@/components/v3/ItemRow";
import { SummaryReport } from "@/components/v3/SummaryReport";
import { one, periodQuery, withParams } from "@/components/v3/links";
import { decisions, insightView, type ObjectiveView } from "@/lib/analysis/insights";
import { ROLE_LABEL } from "@/lib/analysis/roles";
import type { GoalStatus } from "@/lib/analysis/types";
import { loadAnalysis } from "@/lib/data/workspaces";
import { money } from "@/lib/format";

export const metadata = { title: "Overview" };

const STATE: Record<GoalStatus["state"], ["bad" | "warn" | "good" | "flat", string]> = {
  far_off: ["bad", "Far off"],
  off_track: ["warn", "Off track"],
  worse: ["bad", "Worse"],
  on_track: ["good", "On track"],
  better: ["good", "Better"],
  flat: ["flat", "Steady"],
  unknown: ["flat", "Not judged"],
};
const STATE_CLS = { bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", good: "bg-good-soft text-good", flat: "bg-surface-2 text-muted" };

// Overview: status first (pills + one line), then goals, key numbers with their
// trend, campaigns doing great, decisions waiting, and every campaign in one row.
export default async function OverviewPage({ params, searchParams }: PageProps<"/c/[ws]">) {
  const { ws } = await params;
  const sp = await searchParams;
  const a = await loadAnalysis(ws, await selectionParams(searchParams));
  if (!a) return <EmptyData workspaceId={ws} />;
  const v = insightView(a);
  const cur = a.workspace.currency;
  const dec = decisions(v);
  const off = v.objectives.filter((o) => o.goal && ["far_off", "off_track", "worse"].includes(o.goal.state)).length;
  const stake = dec.filter((d) => d.bucket === "problem").reduce((s, d) => s + d.stake, 0);
  const trendKey = one(sp, "trend");
  const trend = v.objectives.find((o) => o.objective === trendKey) ?? v.objectives[0];
  const pq = periodQuery(sp);
  const openKey = one(sp, "open");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Overview</p>
          <h1 className="mt-1 text-2xl">{a.workspace.name}</h1>
        </div>
        <Link href={withParams(sp, { summary: "1", open: null })} scroll={false} className="inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:bg-surface">
          Summary report
        </Link>
      </div>
      <PeriodBar selection={a.selection} coverage={a.coverage} hasPeriodData={a.totals.spendB > 0 || a.campaigns.some((c) => c.b.impressions > 0)} hasComparisonData={a.hasComparisonData} />

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Pill n={String(off)} label={`goal${off === 1 ? "" : "s"} off track`} tone={off ? "bad" : null} />
          <Pill n={String(dec.length)} label={`decision${dec.length === 1 ? "" : "s"} waiting`} href={`/c/${ws}/actions${pq}`} />
          <Pill n={money(stake, cur)} label="spent where problems were found" />
          <Pill n={String(v.great.length)} label="doing great" tone={v.great.length ? "good" : null} />
        </div>
        {v.oneLine && <p className="text-[15px]">{v.oneLine}</p>}
      </div>

      {a.dataNotes
        .filter((n) => n.level === "warn")
        .map((n) => (
          <p key={n.key} className="rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn" role="status">
            {n.text}
          </p>
        ))}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Goals" hint={`Bar: this period · solid mark: your target · dashed: break-even · grey tick: ${v.compareLabel ?? "no comparison"}`}>
          {v.objectives.length === 0 ? (
            <p className="text-sm text-muted">No spend in this period.</p>
          ) : (
            <div className="grid gap-4">
              {v.objectives.map((o) => (
                <Goal key={o.objective} o={o} ws={ws} cur={cur} compareLabel={v.compareLabel} />
              ))}
            </div>
          )}
        </Section>
        <Section title="Key numbers" hint={`▲▼ vs ${v.compareLabel ?? "— (no comparison)"} · click a tile for its trend`}>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="grid gap-1 rounded-xl border border-line p-3">
              <span className="text-xs text-muted">Spend · {v.label}</span>
              <span className="num text-[22px] font-medium">{money(v.spend, cur)}</span>
              <DeltaChip change={v.spendChange} mode="neutral" />
            </div>
            {v.objectives.slice(0, 3).map((o) => (
              <Link key={o.objective} href={withParams(sp, { trend: o.objective, open: null })} scroll={false} aria-current={o === trend ? "true" : undefined} className={cx("grid gap-1 rounded-xl border p-3 hover:border-faint", o === trend ? "border-violet" : "border-line")}>
                <span className="text-xs text-muted">
                  {o.label} · {o.kpiLabel}
                </span>
                <span className="num text-[22px] font-medium">{o.kpiMissing ? "—" : fmtKpi(o.value, o.mode, cur)}</span>
                <span className="flex items-center justify-between gap-2">
                  <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />
                  <Spark series={o.series} target={o.target} />
                </span>
              </Link>
            ))}
          </div>
          {v.objectives.length > 3 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="label">More:</span>
              {v.objectives.slice(3).map((o) => (
                <Link key={o.objective} href={withParams(sp, { trend: o.objective, open: null })} scroll={false} className={cx("rounded-full border px-2.5 py-0.5 text-xs", o === trend ? "border-violet text-violet" : "border-line text-muted hover:text-fg")}>
                  {o.label} {fmtKpi(o.value, o.mode, cur)}
                </Link>
              ))}
            </div>
          )}
          {trend && (
            <div className="mt-3 rounded-xl border border-line p-3">
              <span className="text-xs font-medium">
                {trend.label}: {trend.resultLabel} per day and {trend.kpiLabel}
              </span>
              <DailyChart series={trend.series} from={v.from} to={v.to} currency={cur} height={180} />
            </div>
          )}
        </Section>
      </div>

      <Section title="Doing great: consider more budget" hint="Campaigns clearly beating their target or their own past">
        {v.great.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {v.great.map((g) => (
              <div key={g.key} className="grid gap-2 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <PrioChip p={g.priority} />
                  <KindTag k="opportunity" />
                  <Plat p={g.platform} />
                </div>
                <span className="font-medium">{g.campaign}</span>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="num">{g.kpi}</span>
                  <span className="text-muted">{Math.round(g.share * 100)}% of spend</span>
                </div>
                <p className="text-sm text-muted">{g.why}</p>
                <p className="text-sm">
                  <b className="font-medium">Consider:</b> {g.action}
                </p>
                <Link href={withParams(sp, { open: g.key })} scroll={false} className="text-sm text-violet hover:underline">
                  See the analysis and daily chart →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">No campaign is clearly beating its target or its own past in {v.label}.</p>
        )}
        {v.reuse.length > 0 && (
          <div className="mt-4">
            <span className="label">Ads worth copying</span>
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {v.reuse.map((r) => (
                <li key={r.key}>
                  <Link href={withParams(sp, { open: r.key })} scroll={false} className="font-medium text-violet hover:underline">
                    {r.name}
                  </Link>{" "}
                  <span className="text-xs text-muted">({r.where})</span>: {r.why}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title="Needs your decision"
        hint="Most urgent first"
        action={
          <Link href={`/c/${ws}/actions${pq}`} className="text-sm text-violet hover:underline">
            All in Actions →
          </Link>
        }
      >
        <Legend />
        {dec.length ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            {dec.slice(0, 5).map((d, i) => (
              <ItemRow key={d.key} d={d} href={withParams(sp, { open: d.key })} start={i === 0} currency={cur} />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">Nothing waiting for a decision in {v.label}.</p>
        )}
      </Section>

      <Section
        title="All campaigns"
        hint="One row each · open any for its analysis and daily chart"
        action={
          <Link href={`/c/${ws}/campaigns${pq}`} className="text-sm text-violet hover:underline">
            Ad sets and ads →
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="label grid grid-cols-[170px_minmax(0,1.4fr)_150px_minmax(0,1fr)_150px] gap-3 border-b border-line px-2 pb-2 !text-[10px]">
              <span>Priority · state</span>
              <span>Campaign</span>
              <span>Share of spend</span>
              <span>Result vs expected</span>
              <span>Next step</span>
            </div>
            {v.levels.campaign.map((h) => {
              const key = v.keyForEntity({ level: "campaign", id: h.id });
              const val = h.kpi;
              const ex = h.expected;
              const max = Math.max(val ?? 0, ex ?? 0) * 1.25 || 1;
              const good = ex === null || val === null ? null : h.mode === "roas" ? val >= ex : val <= ex;
              return (
                <Link key={h.id} href={key ? withParams(sp, { open: key }) : "#"} scroll={false} className="grid grid-cols-[170px_minmax(0,1.4fr)_150px_minmax(0,1fr)_150px] items-center gap-3 border-b border-line px-2 py-2.5 text-sm last:border-b-0 hover:bg-surface">
                  <span className="flex flex-wrap gap-1">
                    <PrioChip p={h.priority} />
                    <KindTag k={h.kind} />
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate font-medium">{h.name}</b>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Plat p={h.platform} />
                      {h.objectiveLabel}
                      {h.role !== "prospecting" && ` · ${ROLE_LABEL[h.role]}`}
                    </span>
                  </span>
                  <span className="grid gap-1">
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <i className="block h-full rounded-full bg-violet" style={{ width: `${Math.max(2, h.share * 100)}%` }} />
                    </span>
                    <span className="num text-xs text-muted">
                      {Math.round(h.share * 100)}% · {money(h.spend, cur)}
                    </span>
                  </span>
                  <span className="grid gap-1">
                    <span className="num text-xs">
                      {h.kpiShort} {fmtKpi(val, h.mode, cur)}
                      {ex !== null && <span className="text-muted"> vs {fmtKpi(ex, h.mode, cur)}</span>}
                    </span>
                    {val !== null && (
                      <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="h-3.5 w-full" aria-hidden>
                        <rect x="0" y="4" width="200" height="6" rx="3" fill="var(--surface-2)" />
                        <rect x="0" y="4" width={(val / max) * 200} height="6" rx="3" fill={good === false ? "var(--bad)" : "var(--muted)"} />
                        {ex !== null && <rect x={(ex / max) * 200 - 1} y="0" width="2" height="14" fill="var(--fg)" />}
                      </svg>
                    )}
                  </span>
                  <span className="text-xs">{h.label ?? ""}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      {a.dataNotes.some((n) => n.level === "info") && (
        <details className="rounded-lg border border-line px-4 py-2.5 text-sm">
          <summary className="cursor-pointer text-muted">Data notes ({a.dataNotes.filter((n) => n.level === "info").length}): things to know about these numbers</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {a.dataNotes
              .filter((n) => n.level === "info")
              .map((n) => (
                <li key={n.key}>• {n.text}</li>
              ))}
          </ul>
        </details>
      )}

      {one(sp, "summary") && <SummaryReport a={a} v={v} closeHref={withParams(sp, { summary: null })} />}
      {openKey && <ItemDrawer a={a} view={v} itemKey={openKey} closeHref={withParams(sp, { open: null })} />}
    </div>
  );
}

function Pill({ n, label, tone = null, href }: { n: string; label: string; tone?: "bad" | "good" | null; href?: string }) {
  const cls = cx("inline-flex items-baseline gap-2 rounded-[10px] border px-3.5 py-2 text-sm", tone === "bad" ? "border-transparent bg-bad-soft text-bad" : tone === "good" ? "border-transparent bg-good-soft text-good" : "border-line bg-surface");
  const body = (
    <>
      <span className="num text-xl font-medium">{n}</span> {label}
    </>
  );
  return href ? (
    <Link href={href} className={cx(cls, "hover:border-faint")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

function Goal({ o, ws, cur, compareLabel }: { o: ObjectiveView; ws: string; cur: string; compareLabel: string | null }) {
  const [tone, label] = STATE[o.goal?.state ?? "unknown"];
  const cap = [
    o.target !== null ? `target ${fmtKpi(o.target, o.mode, cur)}` : compareLabel ? "no target · vs last period" : "no target",
    o.breakEven !== null ? `break-even ${fmtKpi(o.breakEven, o.mode, cur)}` : null,
    o.previous !== null && compareLabel ? `${compareLabel}: ${fmtKpi(o.previous, o.mode, cur)}` : null,
    o.mode === "roas" ? "higher is better" : "lower is better",
  ].filter(Boolean);
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-medium">{o.label}</span>
        <span className={cx("num rounded px-1.5 py-px text-[10.5px] uppercase tracking-wider", STATE_CLS[tone])}>{label}</span>
        {o.target === null && o.mode !== "cpm" && (
          <Link href={`/c/${ws}/settings#targets`} className="text-xs text-violet hover:underline">
            Set target
          </Link>
        )}
        <span className="num ml-auto">
          {o.kpiShort} {o.kpiMissing ? "not in export" : fmtKpi(o.value, o.mode, cur)}
        </span>
      </div>
      <GoalBullet value={o.value} target={o.target} breakEven={o.breakEven} previous={compareLabel ? o.previous : null} tone={tone} label={`${o.kpiShort} ${fmtKpi(o.value, o.mode, cur)}`} />
      <span className="num text-xs text-muted">{cap.join(" · ")}</span>
    </div>
  );
}
