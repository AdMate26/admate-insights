"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CompareMode, Preset, Report, Selection } from "@/lib/analysis/periods";
import { reportLabel } from "@/lib/analysis/periods";
import { rangeLabel } from "@/lib/format";
import { buttonClass, cx, PlatformBadge } from "./ui";

const KEYS = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"];

// One control for "which period, compared with what": by date range when there
// is daily data, or by uploaded report (always available).
export function PeriodControl({
  selection,
  presets,
  reports,
  minDate,
  maxDate,
  hasDaily,
}: {
  selection: Selection;
  presets: Preset[];
  reports: Report[];
  minDate: string | null;
  maxDate: string | null;
  hasDaily: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"dates" | "reports">(selection.mode === "reports" || !hasDaily ? "reports" : "dates");

  function go(p: Record<string, string | undefined>) {
    const q = new URLSearchParams(search.toString());
    for (const k of KEYS) q.delete(k);
    for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
    router.push(`${path}?${q.toString()}`);
    setOpen(false);
  }

  const current =
    selection.mode === "reports" && selection.reports
      ? { main: reportLabel(selection.reports.b), vs: selection.reports.a ? reportLabel(selection.reports.a) : "no comparison" }
      : { main: selection.label, vs: selection.compareLabel };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5 text-left hover:bg-surface" aria-expanded={open}>
        <span className="num truncate text-sm font-medium">{current.main}</span>
        <span className="text-xs text-muted">vs</span>
        <span className="num truncate text-sm text-muted">{current.vs}</span>
        {selection.normalized && <span className="label !text-[10px]" title="Periods have different lengths: volumes are compared per day">per day</span>}
        <span aria-hidden className="text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,460px)] rounded-xl border border-line bg-bg p-4 shadow-xl">
          <div className="inline-flex rounded-lg border border-line p-0.5 text-sm">
            <button className={cx("rounded-md px-3 py-1", tab === "dates" ? "bg-surface-2 font-medium" : "text-muted", !hasDaily && "cursor-not-allowed opacity-50")} disabled={!hasDaily} onClick={() => setTab("dates")} title={hasDaily ? undefined : "Needs an export with a daily breakdown"}>
              By date
            </button>
            <button className={cx("rounded-md px-3 py-1", tab === "reports" ? "bg-surface-2 font-medium" : "text-muted")} onClick={() => setTab("reports")}>
              By uploaded report
            </button>
          </div>
          {tab === "dates" ? (
            <DatePanel selection={selection} presets={presets} minDate={minDate} maxDate={maxDate} go={go} onCancel={() => setOpen(false)} />
          ) : (
            <ReportPanel reports={reports} selection={selection} go={go} onCancel={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

const MODES: { value: CompareMode; label: string }[] = [
  { value: "previous", label: "Previous period" },
  { value: "last_year", label: "Same period last year" },
  { value: "custom", label: "Custom range…" },
  { value: "day", label: "Day vs day…" },
  { value: "none", label: "No comparison" },
];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const wd = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const input = "num rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-violet";

function DatePanel({ selection, presets, minDate, maxDate, go, onCancel }: { selection: Selection; presets: Preset[]; minDate: string | null; maxDate: string | null; go: (p: Record<string, string | undefined>) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<CompareMode>(selection.mode === "reports" ? "previous" : selection.mode);
  const [from, setFrom] = useState(selection.b.from);
  const [to, setTo] = useState(selection.b.to);
  const [cfrom, setCfrom] = useState(selection.a?.from ?? "");
  const [cto, setCto] = useState(selection.a?.to ?? "");

  function apply() {
    if (mode === "day") go({ from, to: from, cmp: "day", cfrom });
    else if (mode === "custom") go({ from, to, cmp: "custom", cfrom, cto });
    else go({ from, to, cmp: mode });
  }
  const sameWeekday = (() => {
    if (!from) return "";
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div>
      {presets.length > 0 && (
        <>
          <div className="label mt-4">Quick picks</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p.label} onClick={() => go(p.params as Record<string, string>)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-violet hover:text-violet">
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="label mt-4">{mode === "day" ? "Day" : "Period"}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input type="date" className={input} value={from} min={minDate ?? undefined} max={maxDate ?? undefined} onChange={(e) => setFrom(e.target.value)} />
        {mode !== "day" && (
          <>
            <span className="text-muted">–</span>
            <input type="date" className={input} value={to} min={minDate ?? undefined} max={maxDate ?? undefined} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {mode === "day" && from && <span className="text-xs text-muted">{wd(from)}</span>}
      </div>
      <div className="label mt-4">Compare with</div>
      <select className={cx(input, "mt-1.5 w-full")} value={mode} onChange={(e) => setMode(e.target.value as CompareMode)}>
        {MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      {(mode === "custom" || mode === "day") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" className={input} value={cfrom} min={minDate ?? undefined} max={maxDate ?? undefined} onChange={(e) => setCfrom(e.target.value)} />
          {mode === "custom" && (
            <>
              <span className="text-muted">–</span>
              <input type="date" className={input} value={cto} min={minDate ?? undefined} max={maxDate ?? undefined} onChange={(e) => setCto(e.target.value)} />
            </>
          )}
          {mode === "day" && cfrom && <span className="text-xs text-muted">{wd(cfrom)}</span>}
        </div>
      )}
      {mode === "day" && cfrom && from && wd(cfrom) !== wd(from) && (
        <p className="mt-2 text-xs text-muted">
          Days of the week behave differently.{" "}
          <button className="text-violet underline" onClick={() => setCfrom(sameWeekday)}>
            Compare with {wd(from)} {sameWeekday} instead?
          </button>
        </p>
      )}
      {mode === "day" && <p className="mt-2 text-xs text-muted">A single day has little data, so AdMate treats day-vs-day changes as early signals.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={buttonClass.ghost} onClick={onCancel}>
          Cancel
        </button>
        <button className={buttonClass.primary} onClick={apply} disabled={!from || (mode !== "day" && !to) || ((mode === "custom" || mode === "day") && !cfrom)}>
          Apply
        </button>
      </div>
    </div>
  );
}

export function ReportPanel({ reports, selection, go, onCancel }: { reports: Report[]; selection: Selection; go: (p: Record<string, string | undefined>) => void; onCancel: () => void }) {
  const current = selection.reports;
  const [picked, setPicked] = useState<string[]>(current ? [current.b.importId, ...(current.a ? [current.a.importId] : [])] : []);
  const [swapped, setSwapped] = useState(!!current?.a && (current.b.to < current.a.to || (current.b.to === current.a.to && current.b.from < current.a.from)));
  const byId = (id: string) => reports.find((r) => r.importId === id)!;
  const ordered = [...picked].map(byId).filter(Boolean).sort((x, y) => y.to.localeCompare(x.to) || y.from.localeCompare(x.from));
  const [main, other] = swapped ? [ordered[1] ?? ordered[0], ordered[1] ? ordered[0] : undefined] : [ordered[0], ordered[1]];

  function toggle(id: string) {
    setSwapped(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  }

  if (reports.length === 0) return <p className="mt-4 text-sm text-muted">No uploaded reports yet.</p>;
  return (
    <div>
      <p className="mt-3 text-xs text-muted">Tick one report to view it, or two to compare them. The newer one is compared with the older one.</p>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {reports.map((r) => {
          const on = picked.includes(r.importId);
          return (
            <li key={r.importId}>
              <label className={cx("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2", on ? "border-violet bg-violet-soft" : "border-line hover:bg-surface")}>
                <input type="checkbox" checked={on} onChange={() => toggle(r.importId)} className="accent-[var(--violet)]" />
                <PlatformBadge platform={r.platform} />
                <span className="min-w-0 flex-1">
                  <span className="num block text-sm font-medium">{rangeLabel(r.from, r.to)}</span>
                  <span className="block truncate text-xs text-muted" title={r.fileName}>
                    {r.fileName} · {r.granularity === "daily" ? "daily rows" : "period totals"}
                  </span>
                </span>
                {on && main?.importId === r.importId && <span className="label !text-[10px] !text-violet">Main</span>}
                {on && other?.importId === r.importId && <span className="label !text-[10px]">Compared with</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {main && other && main.platform !== other.platform && (
        <p className="mt-2 text-xs text-muted">Different platforms count results differently, so compare the direction, not the exact numbers.</p>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        {other && (
          <button className={buttonClass.quiet + " mr-auto"} onClick={() => setSwapped((s) => !s)}>
            ⇄ Swap
          </button>
        )}
        <button className={buttonClass.ghost} onClick={onCancel}>
          Cancel
        </button>
        <button className={buttonClass.primary} onClick={() => main && go({ report: main.importId, vs: other ? other.importId : "none" })} disabled={!main}>
          {other ? "Compare" : "View report"}
        </button>
      </div>
    </div>
  );
}
