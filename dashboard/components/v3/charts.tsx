import { money, num, shortDate } from "@/lib/format";
import type { Series } from "@/lib/analysis/insights";
import { fmtKpi } from "./bits";

// Plain SVG charts (no chart library), each with a text alternative.

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Tiny KPI line for a tile, with the target as a dashed line.
export function Spark({ series, target, w = 110, h = 30 }: { series: Series; target: number | null; w?: number; h?: number }) {
  const pts = series.days;
  const vals = pts.map((p) => p.kpi).filter((v): v is number => v !== null);
  if (vals.length < 3) return null;
  const all = target !== null ? [...vals, target] : vals;
  const max = Math.max(...all) * 1.08;
  const min = Math.min(0, ...all);
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  let d = "";
  pts.forEach((p, i) => {
    if (p.kpi === null) return;
    d += `${d && pts[i - 1]?.kpi !== null ? "L" : "M"}${x(i).toFixed(1)},${y(p.kpi).toFixed(1)} `;
  });
  const first = pts.findIndex((p) => p.kpi !== null);
  const last = pts.findLastIndex((p) => p.kpi !== null);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden className="shrink-0">
      <path d={`${d}L${x(last).toFixed(1)},${h - 2} L${x(first).toFixed(1)},${h - 2} Z`} fill="var(--surface-2)" />
      {target !== null && <line x1="2" x2={w - 2} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="1" />}
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(pts[last].kpi!)} r="2.6" fill="var(--violet)" />
    </svg>
  );
}

// Daily results as bars, cost per result (or ROAS) as a line, the selected period
// shaded and the best day marked.
export function DailyChart({ series, from, to, currency = "USD", height = 200 }: { series: Series; from: string; to: string; currency?: string; height?: number }) {
  const ds = series.days;
  if (ds.length < 2) return <p className="text-xs text-muted">Not enough daily data for a chart. Upload an export with a daily breakdown to see this.</p>;
  const W = 640, H = height, L = 44, R = 54, T = 18, B = 26;
  const maxR = Math.max(1, ...ds.map((d) => d.results)) * 1.15;
  const kv = ds.map((d) => d.kpi).filter((v): v is number => v !== null && v > 0);
  const maxK = kv.length ? Math.max(...kv) * 1.15 : 1;
  const bw = (W - L - R) / ds.length;
  const x = (i: number) => L + i * bw;
  const yR = (v: number) => H - B - (v / maxR) * (H - T - B);
  const yK = (v: number) => H - B - (v / maxK) * (H - T - B);
  const inP = (d: { date: string }) => d.date >= from && d.date <= to;
  const best = ds.reduce((b, d, i) => (inP(d) && d.results > 0 && (b < 0 || d.results > ds[b].results) ? i : b), -1);
  let line = "";
  ds.forEach((d, i) => {
    if (d.kpi === null || d.kpi <= 0) return;
    const prev = ds[i - 1]?.kpi;
    line += `${line && prev !== null && prev !== undefined && prev > 0 ? "L" : "M"}${(x(i) + bw / 2).toFixed(1)},${yK(d.kpi).toFixed(1)} `;
  });
  const i0 = ds.findIndex(inP);
  const i1 = ds.findLastIndex(inP);
  const step = Math.max(1, Math.ceil(ds.length / 8));
  const k = (v: number) => fmtKpi(v, series.mode, currency);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${series.resultLabel} per day and ${series.kpiLabel}`}>
        {i0 >= 0 && <rect x={x(i0)} y={T - 8} width={(i1 - i0 + 1) * bw} height={H - T - B + 8} fill="var(--violet-soft)" />}
        {[0, maxR / 2, maxR].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yR(v)} y2={yR(v)} stroke="var(--line)" strokeWidth="0.8" />
            <text x={L - 6} y={yR(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)" className="num">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v)}
            </text>
          </g>
        ))}
        {ds.map((d, i) => (
          <rect key={d.date} x={x(i) + bw * 0.18} y={yR(d.results)} width={bw * 0.64} height={H - B - yR(d.results)} rx="1.5" fill={i === best ? "var(--violet)" : inP(d) ? "var(--faint)" : "var(--line)"}>
            <title>{`${fmtDay(d.date)}: ${num(d.results)} ${series.resultLabel}${d.kpi !== null ? `, ${series.kpiShort} ${k(d.kpi)}` : ""}, spend ${money(d.spend, currency)}`}</title>
          </rect>
        ))}
        {best >= 0 && (
          <text x={x(best) + bw / 2} y={yR(ds[best].results) - 5} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--violet)">
            best
          </text>
        )}
        <path d={line} fill="none" stroke="var(--fg)" strokeWidth="1.8" strokeLinejoin="round" />
        {[maxK / 2, maxK].map((v) => (
          <text key={v} x={W - R + 6} y={yK(v) + 3} fontSize="9.5" fill="var(--fg)" className="num">
            {k(v)}
          </text>
        ))}
        {ds.map((d, i) =>
          i % step === 0 || i === ds.length - 1 ? (
            <text key={d.date} x={x(i) + bw / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)" className="num">
              {shortDate(d.date).replace(/, \d+$/, "")}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-faint" />
          {series.resultLabel} per day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-violet" />
          best day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <line x1="0" x2="18" y1="4" y2="4" stroke="var(--fg)" strokeWidth="2" />
          </svg>
          {series.kpiShort} (right axis)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-soft" />
          selected period
        </span>
        <span className="sr-only">{ds.map((d) => `${d.date}: ${num(d.results)} ${series.resultLabel}`).join("; ")}</span>
      </figcaption>
    </figure>
  );
}

// Goal bar: this period's value, the target (solid), break-even (dashed) and the
// comparison period (grey tick).
export function GoalBullet({ value, target, breakEven, previous, tone, label }: { value: number | null; target: number | null; breakEven: number | null; previous: number | null; tone: "bad" | "warn" | "good" | "flat"; label: string }) {
  const vals = [value, target, breakEven, previous].filter((v): v is number => v !== null && v > 0);
  if (value === null || vals.length === 0) return null;
  const max = Math.max(...vals) * 1.18;
  const W = 400, X = (v: number) => (v / max) * W;
  const fill = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--good)" : "var(--muted)";
  return (
    <svg viewBox={`0 0 ${W} 26`} preserveAspectRatio="none" className="block h-[26px] w-full overflow-visible" role="img" aria-label={label}>
      <rect x="0" y="9" width={W} height="8" rx="4" fill="var(--surface-2)" />
      <rect x="0" y="9" width={X(value)} height="8" rx="4" fill={fill} />
      {previous !== null && <rect x={X(previous) - 1} y="11" width="2" height="4" fill="var(--faint)" />}
      {breakEven !== null && <line x1={X(breakEven)} x2={X(breakEven)} y1="3" y2="23" stroke="var(--fg)" strokeWidth="1.5" strokeDasharray="2 2" />}
      {target !== null && <rect x={X(target) - 1.5} y="2" width="3" height="22" fill="var(--fg)" />}
    </svg>
  );
}

export { fmtDay };
