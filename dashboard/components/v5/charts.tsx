"use client";

import { Fragment } from "react";
import { useV5 } from "./ctx";
import { T } from "./bits";
import { D0, drvName, fmtDate, fmtDay, higher, n0, plural, signed, STATE, WEEKDAYS, type Driver, type Fmt, type Goal, type Mode } from "./core";

// The prototype's charts (10-shared.js), as React SVG. Every value comes from the engine.

export type DayPoint = { date: string; spend: number; results: number; kpi: number | null };
export type Series = { mode: Mode; kpiShort: string; kpiLabel: string; resultLabel: string; days: DayPoint[] };

// A goal's daily points as a Series.
export const goalSeries = (o: Goal): Series => ({
  mode: o.mode,
  kpiShort: o.kpiShort,
  kpiLabel: o.kpiLabel,
  resultLabel: o.resultLabel,
  days: o.daily.map((d) => ({ date: d.date, spend: d.spend, results: d.results, kpi: d.v })),
});

export function Spark({ points, target, w = 100, h = 28 }: { points: { v: number | null }[]; target?: number | null; w?: number; h?: number }) {
  const pts = points.filter((p) => p.v != null);
  if (pts.length < 3) return null;
  const vals = pts.map((p) => p.v as number).concat(target != null ? [target] : []);
  const max = Math.max(...vals) * 1.08;
  const min = Math.min(0, ...vals);
  const x = (i: number) => (i / (points.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  let d = "";
  points.forEach((p, i) => {
    if (p.v == null) return;
    d += `${d && points[i - 1]?.v != null ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `;
  });
  const first = points.findIndex((p) => p.v != null);
  const last = points.length - 1 - [...points].reverse().findIndex((p) => p.v != null);
  const area = `${d}L${x(last).toFixed(1)},${h - 2} L${x(first).toFixed(1)},${h - 2} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ width: w, height: h }}>
      <path d={area} fill="var(--surface-2)" />
      {target != null && <line x1="2" x2={w - 2} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="1" />}
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(points[last].v as number)} r="2.6" fill="var(--violet)" />
    </svg>
  );
}

// Results per day as bars and the main result (cost per result or ROAS) as a line;
// the selected period shaded and its best day marked.
export function DailyChart({ series, from, to, h = 200 }: { series: Series | null; from: string; to: string; h?: number }) {
  const { f } = useV5();
  const ds = series?.days ?? [];
  if (!series || ds.length < 2) return <p className="small-note">Not enough daily data for a chart.</p>;
  const W = 640, H = h, L0 = 44, R = 54, T0 = 18, B = 26;
  const maxR = Math.max(1, ...ds.map((d) => d.results)) * 1.15;
  const kv = ds.map((d) => d.kpi).filter((v): v is number => v != null && v > 0);
  const maxK = kv.length ? Math.max(...kv) * 1.15 : 1;
  const bw = (W - L0 - R) / ds.length;
  const x = (i: number) => L0 + i * bw;
  const yR = (v: number) => H - B - (v / maxR) * (H - T0 - B);
  const yK = (v: number) => H - B - (v / maxK) * (H - T0 - B);
  const inP = (d: DayPoint) => d.date >= from && d.date <= to;
  const best = ds.reduce((b, d, i) => (inP(d) && d.results > 0 && (b < 0 || d.results > ds[b].results) ? i : b), -1);
  let line = "";
  ds.forEach((d, i) => {
    if (d.kpi == null || d.kpi <= 0) return;
    line += `${line && (ds[i - 1]?.kpi ?? 0) > 0 ? "L" : "M"}${(x(i) + bw / 2).toFixed(1)},${yK(d.kpi).toFixed(1)} `;
  });
  const i0 = ds.findIndex(inP);
  const i1 = ds.length - 1 - [...ds].reverse().findIndex(inP);
  const step = Math.max(1, Math.ceil(ds.length / 8));
  const k = (v: number) => f.kpi(v, series.mode);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.resultLabel} per day and ${series.kpiLabel}`}>
        {i0 >= 0 && <rect x={x(i0)} y={T0 - 8} width={(i1 - i0 + 1) * bw} height={H - T0 - B + 8} fill="var(--violet-soft)" />}
        {[0, maxR / 2, maxR].map((v, i) => (
          <Fragment key={i}>
            <line x1={L0} x2={W - R} y1={yR(v)} y2={yR(v)} stroke="var(--line)" strokeWidth="0.8" />
            <text x={L0 - 6} y={yR(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v)}
            </text>
          </Fragment>
        ))}
        {ds.map((d, i) => (
          <rect key={d.date} x={(x(i) + bw * 0.18).toFixed(1)} y={yR(d.results).toFixed(1)} width={(bw * 0.64).toFixed(1)} height={(H - B - yR(d.results)).toFixed(1)} rx="1.5" fill={i === best ? "var(--violet)" : inP(d) ? "var(--faint)" : "var(--line)"}>
            <title>{`${fmtDay(d.date)}: ${n0(d.results)} ${series.resultLabel}${d.kpi != null ? `, ${series.kpiShort} ${k(d.kpi)}` : ""}, spend ${f.money(d.spend)}`}</title>
          </rect>
        ))}
        {best >= 0 && (
          <text x={x(best) + bw / 2} y={yR(ds[best].results) - 5} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--violet)">
            best
          </text>
        )}
        <path d={line} fill="none" stroke="var(--fg)" strokeWidth="1.8" strokeLinejoin="round" />
        {[maxK / 2, maxK].map((v, i) => (
          <text key={i} x={W - R + 6} y={yK(v) + 3} fontSize="9.5" fill="var(--fg)">
            {k(v)}
          </text>
        ))}
        {ds.map((d, i) =>
          i % step === 0 || i === ds.length - 1 ? (
            <text key={d.date} x={x(i) + bw / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
              {fmtDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="legend">
        <span>
          <i className="sw" style={{ background: "var(--faint)" }} />
          {series.resultLabel} per day
        </span>
        <span>
          <i className="sw" style={{ background: "var(--violet)" }} />
          best day
        </span>
        <span>
          <svg width="18" height="8" aria-hidden="true">
            <line x1="0" x2="18" y1="4" y2="4" stroke="var(--fg)" strokeWidth="2" />
          </svg>
          <T s={series.kpiShort} /> (right axis)
        </span>
        <span>
          <i className="sw" style={{ background: "var(--violet-soft)" }} />
          selected period
        </span>
      </div>
    </>
  );
}

// Beginner: one series only (results per day), no second axis.
export function SimpleBars({ series, from, to, h = 150 }: { series: { resultLabel: string; days: { date: string; results: number }[] } | null; from: string; to: string; h?: number }) {
  const ds = series?.days ?? [];
  if (!series || ds.length < 2) return <p className="small-note">Not enough daily data for a chart yet.</p>;
  const W = 640, L0 = 34, R = 8, T0 = 16, B = 24;
  const max = Math.max(1, ...ds.map((d) => d.results)) * 1.18;
  const bw = (W - L0 - R) / ds.length;
  const x = (i: number) => L0 + i * bw;
  const y = (v: number) => h - B - (v / max) * (h - T0 - B);
  const inP = (d: { date: string }) => d.date >= from && d.date <= to;
  const best = ds.reduce((b, d, i) => (inP(d) && d.results > 0 && (b < 0 || d.results > ds[b].results) ? i : b), -1);
  const step = Math.max(1, Math.ceil(ds.length / 7));
  return (
    <>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${series.resultLabel} per day`}>
        <line x1={L0} x2={W - R} y1={h - B} y2={h - B} stroke="var(--line)" />
        <text x={L0 - 6} y={y(max / 1.18) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)">
          {Math.round(max / 1.18)}
        </text>
        {ds.map((d, i) => (
          <rect key={d.date} x={(x(i) + bw * 0.15).toFixed(1)} y={y(d.results).toFixed(1)} width={(bw * 0.7).toFixed(1)} height={(h - B - y(d.results)).toFixed(1)} rx="2" fill={i === best ? "var(--violet)" : inP(d) ? "color-mix(in srgb, var(--violet) 45%, var(--bg))" : "var(--line)"}>
            <title>{`${fmtDay(d.date)}: ${n0(d.results)} ${series.resultLabel}`}</title>
          </rect>
        ))}
        {best >= 0 && (
          <text x={x(best) + bw / 2} y={y(ds[best].results) - 5} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--violet)">
            best
          </text>
        )}
        {ds.map((d, i) =>
          i % step === 0 || i === ds.length - 1 ? (
            <text key={d.date} x={x(i) + bw / 2} y={h - 7} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
              {fmtDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="legend">
        <span>
          <i className="sw" style={{ background: "color-mix(in srgb, var(--violet) 45%, var(--bg))" }} />
          this period
        </span>
        <span>
          <i className="sw" style={{ background: "var(--line)" }} />
          before
        </span>
        <span>
          <i className="sw" style={{ background: "var(--violet)" }} />
          best day
        </span>
      </div>
    </>
  );
}

export function DailyFacts({ series, from, to }: { series: Series | null; from: string; to: string }) {
  const { f } = useV5();
  const inP = (series?.days ?? []).filter((d) => d.date >= from && d.date <= to);
  if (!series || !inP.length) return null;
  const best = inP.reduce((b, d) => (d.results > b.results ? d : b));
  const withRes = inP.filter((d) => d.kpi != null && d.kpi > 0);
  const cheapest = withRes.length ? withRes.reduce((b, d) => ((higher(series.mode) ? d.kpi! > b.kpi! : d.kpi! < b.kpi!) ? d : b)) : null;
  const byWd = Array.from({ length: 7 }, () => ({ r: 0, n: 0 }));
  for (const d of series.days) {
    const w = D0(d.date).getUTCDay();
    byWd[w].r += d.results;
    byWd[w].n++;
  }
  const bestWd = byWd.map((x, i) => ({ i, avg: x.n ? x.r / x.n : 0 })).sort((p, q) => q.avg - p.avg)[0];
  const total = inP.reduce((s, d) => s + d.results, 0);
  return (
    <div className="facts">
      <div>
        Best day<b>{fmtDay(best.date)}</b>
        {n0(best.results)} {series.resultLabel}
      </div>
      {cheapest && (
        <div>
          {higher(series.mode) ? "Highest" : "Cheapest"} <T s={series.kpiShort} />
          <b>{fmtDay(cheapest.date)}</b>
          {f.kpi(cheapest.kpi, series.mode)}
        </div>
      )}
      <div>
        Best weekday (avg, 4 weeks)<b>{WEEKDAYS[bestWd.i]}</b>
        {bestWd.avg.toFixed(1)} {series.resultLabel} a day
      </div>
      <div>
        Total in period<b>{n0(total)}</b>
        {series.resultLabel} over {plural(inP.length, "day")}
      </div>
    </div>
  );
}

// A goal's value against its target (solid mark), break-even (dashed) and the previous period (grey tick).
export function Bullet({ o, compared = true, f }: { o: Goal; compared?: boolean; f: Fmt }) {
  const vals = [o.value, o.target, o.breakEven, compared ? o.previous : null].filter((v): v is number => v != null);
  if (o.value == null || !vals.length) return null;
  const max = Math.max(...vals) * 1.18, W = 400, H = 26, X = (v: number) => (v / max) * W;
  const [cls] = STATE[o.state] ?? ["flat"];
  const fill = cls === "bad" ? "var(--hi)" : cls === "warn" ? "var(--mid)" : cls === "good" ? "var(--good)" : "var(--muted)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${o.kpiShort} ${f.kpi(o.value, o.mode)}`}>
      <rect x="0" y="9" width={W} height="8" rx="4" fill="var(--surface-2)" />
      <rect x="0" y="9" width={X(o.value)} height="8" rx="4" fill={fill} />
      {compared && o.previous != null && <rect x={X(o.previous) - 1} y="11" width="2" height="4" fill="var(--faint)" />}
      {o.breakEven != null && <line x1={X(o.breakEven)} x2={X(o.breakEven)} y1="3" y2="23" stroke="var(--fg)" strokeWidth="1.5" strokeDasharray="2 2" />}
      {o.target != null && <rect x={X(o.target) - 1.5} y="2" width="3" height="22" fill="var(--fg)" />}
    </svg>
  );
}

// "Why it changed": each driver's share of the change in the main result.
export function DriverBars({ drivers }: { drivers: Driver[] | null | undefined }) {
  if (!drivers?.length) return null;
  return (
    <div className="drv">
      {[...drivers]
        .sort((x, y) => y.weight - x.weight)
        .map((d) => (
          <div className="drvrow" key={d.key}>
            <span>
              <T s={drvName(d.key, d.label)} />
            </span>
            <span className="bar" title={`${Math.round(d.weight * 100)}% of the movement`}>
              <i className={d.helped ? "help" : "hurt"} style={{ width: `${Math.max(3, d.weight * 100)}%` }} />
            </span>
            <span className={`ch num ${d.helped ? "delta good" : "delta bad"}`}>
              {d.change > 0 ? "▲" : "▼"} {signed(d.change)}
            </span>
          </div>
        ))}
      <div className="legend">
        <span>
          <i className="sw" style={{ background: "var(--hi)" }} />
          pushed the result the wrong way
        </span>
        <span>
          <i className="sw" style={{ background: "var(--good)" }} />
          helped
        </span>
        <span>Bar length = share of the change it explains</span>
      </div>
    </div>
  );
}

// Several items' main result per day, one line each (Compare).
export function OverlayChart({ list, from, to }: { list: { name: string; series: Series | null }[]; from: string; to: string }) {
  const { f } = useV5();
  const ser = list.filter((x): x is { name: string; series: Series } => !!x.series && x.series.days.length > 1);
  if (!ser.length) return null;
  const W = 640, H = 190, L0 = 50, R = 12, T0 = 14, B = 26;
  const n = ser[0].series.days.length;
  const all = ser.flatMap((s) => s.series.days.map((d) => d.kpi)).filter((x): x is number => x != null && x > 0);
  const max = (all.length ? Math.max(...all) : 1) * 1.12;
  const x = (i: number) => L0 + (i / Math.max(1, n - 1)) * (W - L0 - R);
  const y = (v: number) => H - B - (v / max) * (H - T0 - B);
  const colors = ["var(--violet)", "var(--c2)", "var(--c3)"];
  const dash = ["", "6 4", "2 3"];
  const ds = ser[0].series.days;
  const i0 = ds.findIndex((d) => d.date >= from);
  const i1 = ds.length - 1 - [...ds].reverse().findIndex((d) => d.date <= to);
  const step = Math.max(1, Math.ceil(n / 7));
  return (
    <div className="chartbox">
      <span className="title">
        <T s={ser[0].series.kpiShort} /> per day
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Main result per day for each compared item">
        {i0 >= 0 && <rect x={x(i0)} y={T0 - 6} width={Math.max(2, x(i1) - x(i0))} height={H - T0 - B + 6} fill="var(--violet-soft)" />}
        {[0, max / 2, max].map((vv, i) => (
          <Fragment key={i}>
            <line x1={L0} x2={W - R} y1={y(vv)} y2={y(vv)} stroke="var(--line)" strokeWidth="0.8" />
            <text x={L0 - 6} y={y(vv) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)">
              {f.kpi(vv, ser[0].series.mode)}
            </text>
          </Fragment>
        ))}
        {ser.map((s, k) => {
          let p = "";
          s.series.days.forEach((d, i) => {
            if (d.kpi == null || d.kpi <= 0) return;
            p += `${p && (s.series.days[i - 1]?.kpi ?? 0) > 0 ? "L" : "M"}${x(i).toFixed(1)},${y(d.kpi).toFixed(1)} `;
          });
          return <path key={k} d={p} fill="none" stroke={colors[k]} strokeWidth="2" strokeDasharray={dash[k]} strokeLinejoin="round" />;
        })}
        {ds.map((d, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
              {fmtDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="legend">
        {ser.map((s, k) => (
          <span key={k}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" x2="22" y1="4" y2="4" stroke={colors[k]} strokeWidth="2.5" strokeDasharray={dash[k]} />
            </svg>
            {s.name}
          </span>
        ))}
        <span>
          <i className="sw" style={{ background: "var(--violet-soft)" }} />
          selected period
        </span>
      </div>
    </div>
  );
}
