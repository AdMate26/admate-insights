"use client";

import { useV5 } from "./ctx";
import { usePage } from "./page";
import { DeltaChip, T } from "./bits";
import { days, plain, range, type Goal, type VM } from "./core";

// "Performance overview", laid out like Madgicx's Home: spend and the biggest goals as
// cards, each with this period as a line and the comparison period dashed under it.
// Every number is the engine's; the lines are its daily points, day 1 against day 1.

type Pt = { date: string; v: number | null };

function inRange(pts: Pt[], from: string | null, to: string | null) {
  return from && to ? pts.filter((p) => p.date >= from && p.date <= to) : [];
}

function CompareLines({ cur, prev, label }: { cur: Pt[]; prev: Pt[]; label: string }) {
  const W = 260, H = 64, P = 3;
  if (cur.filter((p) => p.v != null).length < 2) return <p className="pc-none">Trend unavailable</p>;
  const n = Math.max(cur.length, prev.length);
  const vals = [...cur, ...prev].map((p) => p.v).filter((x): x is number => x != null);
  const max = Math.max(...vals) * 1.1 || 1;
  const min = Math.min(0, ...vals);
  const x = (i: number) => P + (i / Math.max(1, n - 1)) * (W - 2 * P);
  const y = (val: number) => H - P - ((val - min) / (max - min || 1)) * (H - 2 * P);
  const path = (pts: Pt[]) => {
    let d = "";
    pts.forEach((p, i) => {
      if (p.v == null) return;
      d += `${d && pts[i - 1]?.v != null ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `;
    });
    return d;
  };
  const line = path(cur);
  const lastI = cur.length - 1 - [...cur].reverse().findIndex((p) => p.v != null);
  const firstI = cur.findIndex((p) => p.v != null);
  const area = `${line}L${x(lastI).toFixed(1)},${H - P} L${x(firstI).toFixed(1)},${H - P} Z`;
  return (
    <svg className="pc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={area} fill="var(--violet-soft)" />
      {prev.length > 1 && <path d={path(prev)} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ name, value, change, mode, confidence, sub, cur, prev, sel, onPick }: {
  name: React.ReactNode; value: string; change: number | null; mode: string; confidence?: string | null; sub: React.ReactNode;
  cur: Pt[]; prev: Pt[]; sel?: boolean; onPick?: () => void;
}) {
  const { vm } = usePage();
  const v = vm!;
  const total = days(v.from, v.to);
  const have = cur.filter((p) => p.v != null).length;
  const body = (
    <>
      <span className="pc-top">
        <span className="pc-name">{name}</span>
        <span className="pc-cov">
          {have} of {total} days
        </span>
      </span>
      <span className="pc-val">
        <span className="num">{value}</span>
        {v.compareLabel && <DeltaChip change={change} mode={mode} confidence={confidence} vs={v.compareLabel} />}
      </span>
      <span className="pc-sub">{sub}</span>
      <CompareLines cur={cur} prev={prev} label={`${typeof name === "string" ? name : "Result"} per day, this period against the comparison period`} />
    </>
  );
  return onPick ? (
    <button type="button" className="pcard" aria-pressed={sel} onClick={onPick}>
      {body}
    </button>
  ) : (
    <div className="pcard">{body}</div>
  );
}

// Total spend per day across the goals shown.
function spendPoints(goals: Goal[]): Pt[] {
  const by = new Map<string, number>();
  for (const o of goals) for (const d of o.daily) by.set(d.date, (by.get(d.date) ?? 0) + d.spend);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, s]) => ({ date, v: s }));
}

export function PerfOverview({ goals, all, beginner = false, spendCard = true, sel, onPick }: { goals: Goal[]; all: Goal[]; beginner?: boolean; spendCard?: boolean; sel?: string; onPick?: (o: Goal) => void }) {
  const { f, cur } = useV5();
  const { vm } = usePage();
  const v: VM = vm!;
  const spend = spendPoints(all);
  const word = (s: string) => (beginner ? plain(s) : s);
  return (
    <section className="section perf" aria-labelledby="po-h">
      <header>
        <h2 id="po-h">Performance overview</h2>
        <span className="hint">{range(v.from, v.to)}</span>
      </header>
      <div className="pcards">
        {spendCard && <Card
          name={beginner ? "You spent" : "Amount spent"}
          value={f.money(v.spend)}
          change={v.spendChange}
          mode="neutral"
          sub={v.compareLabel ? `vs ${v.compareLabel}` : "No comparison available"}
          cur={inRange(spend, v.from, v.to)}
          prev={inRange(spend, v.compareFrom, v.compareTo)}
        />}
        {goals.map((o) => {
          const pts = o.daily.map((d) => ({ date: d.date, v: d.v }));
          return (
            <Card
              key={o.objective}
              name={
                <>
                  {o.label} · {beginner ? word(o.kpiShort) : <T s={o.kpiShort} />}
                </>
              }
              value={o.kpiMissing ? "—" : f.kpi(o.value, o.mode)}
              change={o.change}
              mode={o.mode}
              confidence={o.confidence}
              sub={
                <>
                  {o.previous != null && v.compareLabel ? `was ${f.kpi(o.previous, o.mode)}` : v.compareLabel ? "no data before" : "No comparison available"}
                  {o.target != null ? ` · target ${f.kpi(o.target, o.mode)}` : ""}
                </>
              }
              cur={inRange(pts, v.from, v.to)}
              prev={inRange(pts, v.compareFrom, v.compareTo)}
              sel={sel === o.objective}
              onPick={onPick ? () => onPick(o) : undefined}
            />
          );
        })}
      </div>
      <footer className="pc-foot">
        <span>
          {v.compareLabel ? `Compared with ${v.compareLabel}` : "No comparison period"} · All amounts in {cur}
        </span>
        <span className="pc-legend">
          <span>
            <i className="ln" /> This period
          </span>
          {v.compareLabel && (
            <span>
              <i className="ln dash" /> {v.compareLabel}
            </span>
          )}
        </span>
      </footer>
    </section>
  );
}
