import Link from "next/link";
import { EmptyData } from "@/components/EmptyData";
import { PeriodBar, selectionParams } from "@/components/PeriodBar";
import { cx } from "@/components/ui";
import { AudienceTarget } from "@/components/v3/AudienceTarget";
import { fmtKpi, Section } from "@/components/v3/bits";
import { one, withParams } from "@/components/v3/links";
import { addSegs, AUDIENCE_TABS, audienceAdvice, audienceKpiShort, audienceMode, audienceResultLabel, audienceResults, HOW_TO_EXPORT, judgeSegments, simulatedSplit, type AudienceBreakdown, type AudienceRow, type Seg } from "@/lib/analysis/audience";
import { addDays, weekday, WEEKDAYS } from "@/lib/dates";
import { money, num, pct, rangeLabel } from "@/lib/format";
import { BREAKDOWN_LABEL } from "@/lib/ingest/breakdown";
import { OBJECTIVE_DEFS } from "@/lib/metrics/objectives";
import { getWorkspace, loadAnalysis, loadBreakdowns, loadFacts } from "@/lib/data/workspaces";

export const metadata = { title: "Audience insight" };

const VCH: Record<AudienceRow["verdict"], [string, string]> = {
  best: ["Best value", "bg-good-soft text-good"],
  costly: ["Costly", "bg-bad-soft text-bad"],
  average: ["As expected", "bg-surface-2 text-muted"],
  small: ["Too little data", "border border-dashed border-line text-muted"],
};

// Who responds to the ads, where, on which placement and when, and what to test next.
export default async function AudiencePage({ params, searchParams }: PageProps<"/c/[ws]/audience">) {
  const { ws } = await params;
  const sp = await searchParams;
  const [workspace, a] = await Promise.all([getWorkspace(ws), loadAnalysis(ws, await selectionParams(searchParams))]);
  if (!a || !workspace) return <EmptyData workspaceId={ws} />;
  const cur = a.workspace.currency;
  const b = a.selection.b;
  const spent = a.campaigns.filter((c) => c.b.spend > 0);
  const objectives = a.objectives.filter((o) => o.b.spend > 0).map((o) => o.objective);
  const groups = objectives.map((o) => ({ objective: o, label: OBJECTIVE_DEFS[o].label, campaigns: spent.filter((c) => c.info.objective === o).map((c) => ({ id: c.info.id, name: c.info.name })) }));
  const bdParam = one(sp, "bd");
  const bd: AudienceBreakdown = AUDIENCE_TABS.some(([k]) => k === bdParam) ? (bdParam as AudienceBreakdown) : "age_gender";

  // Default: the biggest objective with enough results for groups to stand out.
  const tParam = one(sp, "t");
  const valid = tParam && (tParam.startsWith("c:") ? spent.some((c) => `c:${c.info.id}` === tParam) : objectives.some((o) => `obj:${o}` === tParam));
  const enough = objectives.find((o) => o !== "awareness" && spent.filter((c) => c.info.objective === o).reduce((s, c) => s + audienceResults(c.b, o), 0) >= 200);
  const target = valid ? tParam! : objectives.length ? `obj:${enough ?? objectives[0]}` : "";
  const chosen = target.startsWith("c:") ? spent.filter((c) => `c:${c.info.id}` === target) : spent.filter((c) => `obj:${c.info.objective}` === target);
  if (chosen.length === 0)
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <Head name={a.workspace.name} />
        <PeriodBar selection={a.selection} coverage={a.coverage} hasPeriodData={false} hasComparisonData={a.hasComparisonData} />
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No campaign spent money in this period.</p>
      </div>
    );
  const o = chosen[0].info.objective;
  const mode = audienceMode(o);
  const resultLabel = audienceResultLabel(o);
  const ids = new Set(chosen.map((c) => c.info.id));

  let segs: Seg[] = [];
  let basis = "";
  let simulated = false;
  let missing = false;
  if (bd === "weekday") {
    // Real daily numbers: the 4 weeks up to the end of the period (or the whole period if longer).
    const start = b.from < addDays(b.to, -27) ? b.from : addDays(b.to, -27);
    const acc = WEEKDAYS.map((name) => ({ name, spend: 0, results: 0 }));
    if (a.coverage.hasDaily) {
      for (const f of await loadFacts(ws, start, b.to)) {
        if (f.granularity !== "daily" || !ids.has(f.campaignId)) continue;
        const d = acc[weekday(f.periodStart)];
        d.spend += f.measures.spend;
        d.results += audienceResults(f.measures, o);
      }
    }
    segs = [...acc.slice(1), acc[0]].filter(() => a.coverage.hasDaily);
    missing = !a.coverage.hasDaily;
    basis = `Your daily numbers, ${rangeLabel(start, b.to)}`;
  } else if (workspace.isSample) {
    for (const c of chosen) addSegs(segs, simulatedSplit(bd, c.info.name, c.info.platform, c.b.spend, audienceResults(c.b, o)));
    simulated = true;
    basis = `Simulated split of the sample’s real totals, ${a.selection.label}`;
  } else {
    const got = await loadBreakdowns(ws, bd, b.from, b.to);
    const rows = got.rows.filter((r) => ids.has(r.campaignId));
    for (const r of rows) addSegs(segs, [{ name: r.segment, spend: r.measures.spend, results: audienceResults(r.measures, o) }]);
    missing = rows.length === 0;
    if (rows.length) {
      const from = rows.reduce((m, r) => (r.from < m ? r.from : m), rows[0].from);
      const to = rows.reduce((m, r) => (r.to > m ? r.to : m), rows[0].to);
      basis = `From your ${BREAKDOWN_LABEL[bd]} export, ${rangeLabel(from, to)}${got.inPeriod ? "" : " (your newest one; it doesn’t cover the selected dates exactly)"}`;
    }
  }
  if (bd === "hour") segs.sort((x, y) => x.name.localeCompare(y.name));
  else if (bd !== "weekday") segs.sort((x, y) => y.spend - x.spend);
  const r = judgeSegments(segs, mode, bd);
  const best = r.rows.filter((x) => x.verdict === "best").sort((x, y) => (y.index ?? 0) - (x.index ?? 0)).slice(0, 2);
  const costly = r.rows.filter((x) => x.verdict === "costly").sort((x, y) => (x.index ?? 0) - (y.index ?? 0)).slice(0, 2);
  const kpiS = audienceKpiShort(o);
  const maxShare = Math.max(0.01, ...r.rows.map((x) => Math.max(x.spendShare, x.resultShare)));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Head name={a.workspace.name} />
      <PeriodBar selection={a.selection} coverage={a.coverage} hasPeriodData={a.totals.spendB > 0} hasComparisonData={a.hasComparisonData} />
      <Section title="Audience insight" hint="Who responds to your ads, where, on which placement and when, and what to test next.">
        <div className="flex flex-wrap items-center gap-3">
          <AudienceTarget value={target} groups={groups} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Breakdown">
            {AUDIENCE_TABS.map(([k, n]) => (
              <Link key={k} href={withParams(sp, { bd: k })} scroll={false} aria-current={k === bd ? "true" : undefined} className={cx("rounded-full border px-3 py-1 text-sm", k === bd ? "border-violet bg-violet-soft text-violet" : "border-line text-muted hover:text-fg")}>
                {n}
              </Link>
            ))}
          </div>
        </div>

        {missing ? (
          <div className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm">
            <p className="font-medium">{bd === "weekday" ? "Day of week needs an export with a daily breakdown." : `No ${BREAKDOWN_LABEL[bd as Exclude<AudienceBreakdown, "weekday">].toLowerCase()} export for these campaigns yet.`}</p>
            <p className="mt-1 text-muted">Export it from your ads manager and upload it under Upload report. AdMate links it to your campaigns by name, and it never changes your campaign totals.</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
              {HOW_TO_EXPORT[bd].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <Link href={`/c/${ws}/upload`} className="mt-3 inline-block font-medium text-violet hover:underline">
              Upload a breakdown export →
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-muted">
              <span>
                <b className="font-medium text-fg">{OBJECTIVE_DEFS[o].label}</b> · {num(r.results)} {resultLabel} · {money(r.spend, cur)} · average {kpiS} {fmtKpi(r.avg, mode, cur)}
              </span>
              <span className={cx(simulated && "text-warn")}>{basis}</span>
            </div>

            {best.length || costly.length ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[...best.map((x) => ["best", x] as const), ...costly.map((x) => ["costly", x] as const)].map(([k, x]) => (
                  <div key={`${k}${x.name}`} className={cx("grid gap-1.5 rounded-xl border p-3", k === "best" ? "border-good/40" : "border-bad/40")}>
                    <span className={cx("num w-fit rounded px-1.5 py-px text-[10.5px] uppercase tracking-wider", VCH[k][1])}>{VCH[k][0]}</span>
                    <b className="font-medium">
                      {x.name}: {k === "best" ? "best value" : "costly"}
                    </b>
                    <p className="text-sm">
                      {x.name} brought {pct(x.resultShare, 0)} of {resultLabel} on {pct(x.spendShare, 0)} of the spend ({kpiS} {fmtKpi(x.cost, mode, cur)} vs {fmtKpi(r.avg, mode, cur)} on average).
                    </p>
                    <p className="text-sm text-muted">
                      <b className="font-medium text-fg">Next step:</b> {audienceAdvice(bd, x.name, k)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">No group stands out clearly: every group gets about the results you’d expect for its share of spend.</p>
            )}

            <Visual bd={bd} rows={r.rows} mode={mode} cur={cur} resultLabel={resultLabel} kpiS={kpiS} />

            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[620px]">
                <div className="label grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_110px_120px] gap-3 border-b border-line pb-2 !text-[10px]">
                  <span>Group</span>
                  <span>Share of spend vs share of {resultLabel}</span>
                  <span>Cost</span>
                  <span>Verdict</span>
                </div>
                {r.rows.map((x) => (
                  <div key={x.name} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_110px_120px] items-center gap-3 border-b border-line py-2 text-sm last:border-b-0">
                    <span>
                      <b className="font-medium">{x.name}</b>
                      <br />
                      <span className="num text-xs text-muted">
                        {num(x.results)} {resultLabel} · {money(x.spend, cur)}
                      </span>
                    </span>
                    <span className="grid gap-1 text-xs">
                      <Bar label="Spend" share={x.spendShare} max={maxShare} cls="bg-faint" />
                      <Bar label={resultLabel.split(" ")[0]} share={x.resultShare} max={maxShare} cls="bg-violet" />
                    </span>
                    <span className="num">
                      {kpiS} {fmtKpi(x.cost, mode, cur)}
                    </span>
                    <span>
                      <span className={cx("num rounded px-1.5 py-px text-[10.5px] uppercase tracking-wider", VCH[x.verdict][1])}>{VCH[x.verdict][0]}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
              Ad platforms already shift delivery toward the people who respond, so a “best value” group may simply be where the platform is doing well. Treat these as tests to run in one ad set, not as changes to make everywhere. A group is only called best or costly when the difference is statistically clear.
            </p>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted">How to get this from your own account</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                {HOW_TO_EXPORT[bd].map((s) => (
                  <li key={s}>{s}</li>
                ))}
                <li>Upload it under Upload report; AdMate links it to your campaigns by name.</li>
              </ul>
            </details>
          </>
        )}
      </Section>
    </div>
  );
}

function Head({ name }: { name: string }) {
  return (
    <div>
      <p className="label">Audience insight</p>
      <h1 className="mt-1 text-2xl">{name}</h1>
    </div>
  );
}

function Bar({ label, share, max, cls }: { label: string; share: number; max: number; cls: string }) {
  return (
    <span className="grid grid-cols-[64px_minmax(0,1fr)_44px] items-center gap-2">
      <span className="truncate text-muted">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-2">
        <i className={cx("block h-full rounded-full", cls)} style={{ width: `${(share / max) * 100}%` }} />
      </span>
      <span className="num text-right">{pct(share, 0)}</span>
    </span>
  );
}

// Heatmap for age & gender, bars for hours and weekdays.
function Visual({ bd, rows, mode, cur, resultLabel, kpiS }: { bd: AudienceBreakdown; rows: AudienceRow[]; mode: "cost" | "cpm" | "roas"; cur: string; resultLabel: string; kpiS: string }) {
  if (bd === "age_gender") {
    const parsed = rows.map((x) => ({ x, m: /^(Women|Men|Unknown gender) (.+)$/.exec(x.name) })).filter((p) => p.m);
    if (parsed.length < 2) return null;
    const ages = [...new Set(parsed.map((p) => p.m![2]))].sort();
    const genders = ["Women", "Men", "Unknown gender"].filter((g) => parsed.some((p) => p.m![1] === g));
    const color = (x?: AudienceRow) => {
      if (!x || x.index === null || x.index <= 0) return "var(--surface-2)";
      const k = Math.max(-1, Math.min(1, Math.log(x.index) / Math.log(2)));
      return k >= 0 ? `color-mix(in srgb, var(--good) ${Math.round(15 + 70 * k)}%, var(--bg))` : `color-mix(in srgb, var(--bad) ${Math.round(15 + 70 * -k)}%, var(--bg))`;
    };
    return (
      <div className="mt-4 rounded-xl border border-line p-3">
        <span className="text-xs font-medium">Cost per result by age and gender</span>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th />
                {ages.map((g) => (
                  <th key={g} className="font-normal text-muted">
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {genders.map((g) => (
                <tr key={g}>
                  <th className="pr-2 text-left font-normal text-muted">{g}</th>
                  {ages.map((age) => {
                    const x = parsed.find((p) => p.m![1] === g && p.m![2] === age)?.x;
                    return (
                      <td key={age} className="num rounded-md py-2 text-center" style={{ background: color(x) }} title={x?.name}>
                        {x ? fmtKpi(x.cost, mode, cur) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="mt-1 block text-xs text-muted">Green: cheaper than average · red: more expensive.</span>
      </div>
    );
  }
  if (bd === "hour" || bd === "weekday") {
    const maxR = Math.max(1, ...rows.map((x) => x.results));
    const top = rows.reduce((m, x) => (x.results > m.results ? x : m), rows[0]);
    const W = 640;
    const bw = (W - 24) / rows.length;
    return (
      <div className="mt-4 rounded-xl border border-line p-3">
        <span className="text-xs font-medium">
          {resultLabel} by {bd === "hour" ? "hour of day (ad account time zone)" : "day of week"}
        </span>
        <svg viewBox={`0 0 ${W} 150`} className="mt-2 w-full" role="img" aria-label={`${resultLabel} by ${bd === "hour" ? "hour" : "weekday"}`}>
          {rows.map((x, i) => {
            const h = (x.results / maxR) * 100;
            const fill = bd === "weekday" ? (x === top ? "var(--violet)" : "var(--faint)") : x.verdict === "best" ? "var(--good)" : x.verdict === "costly" ? "var(--bad)" : "var(--faint)";
            return (
              <g key={x.name}>
                <rect x={12 + i * bw + bw * 0.15} y={118 - h} width={bw * 0.7} height={h} rx="2" fill={fill}>
                  <title>{`${x.name}: ${num(x.results)} ${resultLabel}, ${kpiS} ${fmtKpi(x.cost, mode, cur)}`}</title>
                </rect>
                {(bd === "weekday" || i % 3 === 0) && (
                  <text x={12 + i * bw + bw / 2} y="136" textAnchor="middle" fontSize="10" fill="var(--muted)">
                    {bd === "weekday" ? x.name.slice(0, 3) : `${x.name.slice(0, 2)}h`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <span className="block text-xs text-muted">
          {bd === "weekday" ? (
            <>
              Most {resultLabel}: <b className="font-medium text-fg">{top.name}</b> ({pct(top.resultShare, 0)} of the week).
            </>
          ) : (
            "Green: best-value hours · red: costly hours."
          )}
        </span>
      </div>
    );
  }
  return null;
}
