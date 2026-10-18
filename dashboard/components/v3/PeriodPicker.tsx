"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { previousRange, reportLabel, type Report, type Selection } from "@/lib/analysis/periods";
import { addDays, rangeDays } from "@/lib/dates";
import { rangeLabel, shortDate } from "@/lib/format";
import { ReportPanel } from "../PeriodControl";
import { buttonClass, cx } from "../ui";

const KEYS = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"];
type Kind = "day" | "week" | "month" | "custom";
type Pick = { from: string; to: string; name: string };
type Cmp = "previous" | "pick" | "none";

const D0 = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtDay = (s: string) => D0(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Calendar days, weeks (Mon–Sun) and months that have data.
function choices(kind: Kind, min: string, end: string): (Pick & { small: string })[] {
  if (kind === "day")
    return Array.from({ length: 21 }, (_, i) => addDays(end, -i))
      .filter((d) => d >= min)
      .map((d, i) => ({ from: d, to: d, name: fmtDay(d), small: i === 0 ? "latest day" : "" }));
  if (kind === "week") {
    const mon = addDays(end, -((D0(end).getUTCDay() + 6) % 7));
    const out = [{ from: addDays(end, -6), to: end, name: "Last 7 days", small: rangeLabel(addDays(end, -6), end) }];
    for (let i = 0; i < 12; i++) {
      const f = addDays(mon, -7 * i);
      const t = i === 0 ? end : addDays(f, 6);
      if (t < min) break;
      out.push({ from: f, to: t, name: rangeLabel(f, t), small: i === 0 ? "this week so far" : `week of ${shortDate(f)}` });
    }
    return out;
  }
  if (kind === "month") {
    const out = [{ from: addDays(end, -29), to: end, name: "Last 30 days", small: rangeLabel(addDays(end, -29), end) }];
    let y = D0(end).getUTCFullYear(), m = D0(end).getUTCMonth();
    for (let i = 0; i < 6; i++) {
      const f = iso(new Date(Date.UTC(y, m, 1)));
      const last = iso(new Date(Date.UTC(y, m + 1, 0)));
      if (last < min) break;
      const from = f < min ? min : f;
      const to = last > end ? end : last;
      out.push({ from, to, name: D0(f).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), small: to < last ? "so far" : from > f ? `from ${shortDate(from)}` : "full month" });
      m--;
      if (m < 0) {
        m = 11;
        y--;
      }
    }
    return out;
  }
  return [];
}
const guessKind = (p: { from: string; to: string }): Kind => {
  const n = rangeDays(p.from, p.to);
  return n === 1 ? "day" : n <= 8 ? "week" : "month";
};

// "Show [day / week / month / dates] compared with [the period before / any other period / nothing]",
// or by uploaded report.
export function PeriodPicker({ selection, reports, minDate, maxDate, hasDaily }: { selection: Selection; reports: Report[]; minDate: string | null; maxDate: string | null; hasDaily: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const byReport = selection.mode === "reports";
  const [tab, setTab] = useState<"dates" | "reports">(byReport || !hasDaily ? "reports" : "dates");
  const initial = () => ({
    aKind: guessKind(selection.b),
    a: { ...selection.b, name: selection.label } as Pick,
    cmp: (selection.mode === "none" || !selection.a ? "none" : selection.mode === "previous" ? "previous" : "pick") as Cmp,
    bKind: selection.a ? guessKind(selection.a) : guessKind(selection.b),
    b: selection.a ? ({ ...selection.a, name: selection.compareLabel } as Pick) : null,
  });
  const [pk, setPk] = useState(initial);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(p: Record<string, string | undefined>) {
    const q = new URLSearchParams(search.toString());
    for (const k of KEYS) q.delete(k);
    q.delete("open");
    for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
    router.push(`${path}?${q.toString()}`, { scroll: false });
    setOpen(false);
  }
  function apply() {
    if (pk.cmp === "none") go({ from: pk.a.from, to: pk.a.to, cmp: "none" });
    else if (pk.cmp === "pick" && pk.b) go({ from: pk.a.from, to: pk.a.to, cmp: "custom", cfrom: pk.b.from, cto: pk.b.to });
    else go({ from: pk.a.from, to: pk.a.to, cmp: "previous" });
  }

  const current = byReport && selection.reports ? { main: reportLabel(selection.reports.b), vs: selection.reports.a ? `vs ${reportLabel(selection.reports.a)}` : "no comparison" } : { main: selection.label, vs: selection.a ? `vs ${selection.compareLabel}` : "no comparison" };
  const min = minDate ?? maxDate ?? "";
  const end = maxDate ?? "";
  const prev = previousRange(pk.a);

  const chooser = (which: "a" | "b") => {
    const kind = which === "a" ? pk.aKind : pk.bKind;
    const cur = which === "a" ? pk.a : pk.b;
    const list = kind === "custom" ? [] : choices(kind, min, end);
    const set = (p: Pick) => setPk((s) => ({ ...s, [which]: p }));
    return (
      <div>
        <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="Period type">
          {(["day", "week", "month", "custom"] as Kind[]).map((k) => (
            <button key={k} type="button" aria-pressed={k === kind} className={cx("rounded-md px-2.5 py-1", k === kind ? "bg-surface-2 font-medium" : "text-muted")} onClick={() => setPk((s) => ({ ...s, [which === "a" ? "aKind" : "bKind"]: k }))}>
              {{ day: "Day", week: "Week", month: "Month", custom: "Custom dates" }[k]}
            </button>
          ))}
        </div>
        {kind === "custom" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <input type="date" aria-label="From" className="num rounded-md border border-line bg-bg px-2 py-1.5 text-sm" min={min} max={end} value={cur?.from ?? ""} onChange={(e) => e.target.value && set({ from: e.target.value, to: cur?.to && cur.to >= e.target.value ? cur.to : e.target.value, name: "" })} />
            <span className="text-muted">to</span>
            <input type="date" aria-label="To" className="num rounded-md border border-line bg-bg px-2 py-1.5 text-sm" min={cur?.from || min} max={end} value={cur?.to ?? ""} onChange={(e) => e.target.value && set({ from: cur?.from && cur.from <= e.target.value ? cur.from : e.target.value, to: e.target.value, name: "" })} />
          </div>
        ) : (
          <div className="mt-2 grid max-h-52 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
            {list.map((c) => {
              const on = !!cur && cur.from === c.from && cur.to === c.to;
              return (
                <button key={`${c.from}${c.to}${c.name}`} type="button" aria-pressed={on} onClick={() => set(c)} className={cx("rounded-md border px-2 py-1.5 text-left text-xs", on ? "border-violet bg-violet-soft text-violet" : "border-line hover:bg-surface")}>
                  <span className="block font-medium">{c.name}</span>
                  {c.small && <span className="block text-[11px] text-muted">{c.small}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => {
          if (!open) setPk(initial());
          setOpen((o) => !o);
        }}
        className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5 text-left hover:bg-surface"
        aria-expanded={open}
      >
        <span className="num truncate text-sm font-medium">{current.main}</span>
        <span className="num truncate text-xs text-muted">{current.vs}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(94vw,540px)] rounded-xl border border-line bg-bg p-4 shadow-xl" role="dialog" aria-label="Choose periods">
          <div className="inline-flex rounded-lg border border-line p-0.5 text-sm">
            <button type="button" className={cx("rounded-md px-3 py-1", tab === "dates" ? "bg-surface-2 font-medium" : "text-muted", !hasDaily && "cursor-not-allowed opacity-50")} disabled={!hasDaily} onClick={() => setTab("dates")} title={hasDaily ? undefined : "Needs an export with a daily breakdown"}>
              By date
            </button>
            <button type="button" className={cx("rounded-md px-3 py-1", tab === "reports" ? "bg-surface-2 font-medium" : "text-muted")} onClick={() => setTab("reports")}>
              By uploaded report
            </button>
          </div>
          {tab === "reports" ? (
            <ReportPanel reports={reports} selection={selection} go={go} onCancel={() => setOpen(false)} />
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="label mb-2">1. Show</h4>
                {chooser("a")}
              </div>
              <div>
                <h4 className="label mb-2">2. Compare with</h4>
                <div className="space-y-1.5 text-sm">
                  {(
                    [
                      ["previous", "The period right before", `${rangeLabel(prev.from, prev.to)}${prev.from < min ? " · partly before your first upload" : ""}`],
                      ["pick", "Another period I choose", "Any day, week, month or dates: e.g. this Tuesday vs last Tuesday, or October vs August"],
                      ["none", "Don’t compare", "See this period on its own, judged against each campaign’s own past and your targets"],
                    ] as [Cmp, string, string][]
                  ).map(([v, label, small]) => (
                    <label key={v} className={cx("flex cursor-pointer gap-2 rounded-lg border px-3 py-2", pk.cmp === v ? "border-violet bg-violet-soft" : "border-line")}>
                      <input type="radio" name="pkcmp" value={v} checked={pk.cmp === v} onChange={() => setPk((s) => ({ ...s, cmp: v }))} className="mt-1 accent-[var(--violet)]" />
                      <span>
                        <span className="block font-medium">{label}</span>
                        <span className="block text-xs text-muted">{small}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {pk.cmp === "pick" && <div className="mt-3">{chooser("b")}</div>}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                <span className="mr-auto text-xs text-muted">{minDate && maxDate ? `Data from ${shortDate(minDate)} to ${shortDate(maxDate)}` : ""}</span>
                <button type="button" className={buttonClass.ghost} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" className={buttonClass.primary} onClick={apply} disabled={!pk.a.from || !pk.a.to || (pk.cmp === "pick" && !pk.b)}>
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
