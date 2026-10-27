"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useV5 } from "./ctx";
import { usePage } from "./page";
import { compareRange, days, fmtDate, fmtDay, iso, plural, presetName, presets, prevOf, range, type CompareMode, type Period } from "./core";

// The page header (prototype renderHead): the account above the page title, the date
// picker on the right, and the line saying what is compared. The summary report is its
// own page now (Performance report).
export function PageHead({ title, eyebrow, withPeriod = true, right }: { title: string; eyebrow?: string; withPeriod?: boolean; right?: ReactNode }) {
  const { name, isBeg, isAdv, end, min } = useV5();
  const { vm: v } = usePage();
  const search = useSearchParams();
  const [explain, setExplain] = useState(false);
  const showPeriod = withPeriod && !!v && !!end && !!min;
  const cmp = search.get("cmp");
  const a: Period = v ? { from: v.from, to: v.to } : { from: "", to: "" };
  const name0 = v && end && min ? presetName(a, end, min) : null;
  let ctx: ReactNode = null;
  if (showPeriod && v) {
    if (isBeg) {
      ctx = v.compareLabel ? (
        <span>
          Showing <b>{v.label}</b>, compared with <b>{v.compareLabel}</b>
          {cmp === "custom" ? "" : ` (the ${plural(v.days, "day")} before)`}.
        </span>
      ) : (
        <span>
          Showing <b>{v.label}</b> on its own, with no comparison.
        </span>
      );
    } else {
      const how = cmp === "custom" ? "the period you chose" : days(v.from, v.to) === 1 ? "the day before" : "the same number of days right before";
      const text = v.compareLabel
        ? `Every ▲▼ compares ${v.label} with ${v.compareLabel} (${how})${v.perDay ? ", per day because the periods have different lengths" : ""}.${v.history ? ` Before suggesting “put more money in” or “cut”, AdMate also checks the change against the older history (${v.history}).` : ""}${v.days === 1 ? " One day is for exploring only: no budget calls on a single day." : ""}`
        : `No comparison: campaigns are judged against their own results before this period${v.history ? ` (${v.history})` : ""}, then your targets.`;
      ctx = (
        <>
          <span>
            <b>{v.label}</b> {v.compareLabel ? <>vs <b>{v.compareLabel}</b></> : "· no comparison"}
            {isAdv && v.history ? ` · history ${v.history}` : ""}
          </span>
          <button className="info" type="button" aria-label="How periods are compared" title={text} aria-expanded={explain} onClick={() => setExplain((x) => !x)}>
            i
          </button>
          {explain && <span style={{ flexBasis: "100%" }}>{text}</span>}
        </>
      );
    }
  }
  return (
    <>
      <div className="head">
        <div>
          <span className="eyebrow">{eyebrow ?? name}</span>
          <h1>{title}</h1>
        </div>
        <div className="meta">
          {showPeriod && v && <PeriodButton label={name0 ?? v.label} compareLabel={v.compareLabel} />}
          {right}
        </div>
      </div>
      {ctx && <div className="ctx">{ctx}</div>}
    </>
  );
}

// The date picker, laid out like Madgicx's: quick ranges and the comparison on the
// left; start and end dates, the comparison's dates and a calendar on the right.
// It writes the same URL settings as before (from, to, cmp, cfrom, cto).
type Pk = {
  preset: string | null; // a quick range's id, or null for dates picked by hand
  a: Period | null;
  cmpOn: boolean;
  mode: CompareMode;
  b: Period | null; // the comparison when it is picked by hand
  editing: "a" | "b"; // which range a calendar click sets
  anchor: string | null; // first day clicked, waiting for the last
  month: string; // yyyy-mm on the calendar
};
const CMP: [CompareMode, string][] = [
  ["previous", "Previous period"],
  ["weekday", "Previous period (match day of week)"],
  ["year", "Previous year"],
  ["custom", "Custom"],
];
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};

function PeriodButton({ label, compareLabel }: { label: string; compareLabel: string | null }) {
  const { end, min } = useV5();
  const { vm: v, toast } = usePage();
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const [pk, setPk] = useState<Pk | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const E = end!;
  const MIN = min!;
  useEffect(() => {
    if (!pk) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setPk(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPk(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pk]);
  const list = presets(E, MIN);
  const openPicker = () => {
    const a = { from: v!.from, to: v!.to };
    const c = search.get("cmp");
    const b = c === "custom" && search.get("cfrom") && search.get("cto") ? { from: search.get("cfrom")!, to: search.get("cto")! } : null;
    // A hand-picked comparison that matches a rule shows as that rule.
    const same = (m: CompareMode) => {
      const r = compareRange(a, m);
      return !!r && !!b && r.from === b.from && r.to === b.to;
    };
    const mode: CompareMode = !b ? "previous" : same("weekday") ? "weekday" : same("year") ? "year" : "custom";
    setPk({ preset: list.find((p) => p.from === a.from && p.to === a.to)?.id ?? null, a, cmpOn: c !== "none", mode, b: mode === "custom" ? b : null, editing: "a", anchor: null, month: a.to.slice(0, 7) });
  };
  const set = (patch: Partial<Pk>) => setPk((p) => (p ? { ...p, ...patch } : p));
  const cmp = pk?.a && pk.cmpOn ? (pk.mode === "custom" ? pk.b : compareRange(pk.a, pk.mode)) : null;
  const apply = () => {
    if (!pk) return;
    if (!pk.a || pk.anchor) return toast("Click a first and a last day on the calendar");
    if (pk.cmpOn && !cmp) return toast("Choose the dates to compare with first");
    const q = new URLSearchParams();
    // Keep anything that isn't the period (e.g. a tab), drop the item panel and report mode.
    for (const [k, val] of search.entries()) if (!["from", "to", "cmp", "cfrom", "cto", "report", "vs", "open"].includes(k)) q.set(k, val);
    q.set("from", pk.a.from);
    q.set("to", pk.a.to);
    const prev = prevOf(pk.a);
    if (!pk.cmpOn) q.set("cmp", "none");
    else if (cmp && (cmp.from !== prev.from || cmp.to !== prev.to)) {
      q.set("cmp", "custom");
      q.set("cfrom", cmp.from);
      q.set("cto", cmp.to);
    }
    setPk(null);
    router.push(`${path}?${q}`, { scroll: false });
  };

  // Typing a date: the other end follows when the range would turn inside out.
  const typed = (which: "a" | "b", k: "from" | "to", val: string) => {
    if (!pk || !val) return;
    const d = val < MIN && which === "a" ? MIN : val > E ? E : val;
    const cur = (which === "a" ? pk.a : (pk.b ?? cmp)) ?? { from: d, to: d };
    let { from, to } = cur;
    if (k === "from") {
      from = d;
      if (to < from) to = from;
    } else {
      to = d;
      if (from > to) from = to;
    }
    set(which === "a" ? { a: { from, to }, preset: null, editing: "a", anchor: null, month: d.slice(0, 7) } : { b: { from, to }, mode: "custom", editing: "b", anchor: null, month: d.slice(0, 7) });
  };
  // Calendar: the first click starts a range, the second ends it.
  const clickDay = (ds: string) => {
    if (!pk) return;
    const w = pk.editing;
    if (!pk.anchor) {
      set(w === "a" ? { anchor: ds, a: { from: ds, to: ds }, preset: null } : { anchor: ds, b: { from: ds, to: ds }, mode: "custom" });
      return;
    }
    const r = { from: ds < pk.anchor ? ds : pk.anchor, to: ds < pk.anchor ? pk.anchor : ds };
    set(w === "a" ? { anchor: null, a: r } : { anchor: null, b: r });
  };

  function calendar() {
    const p = pk!;
    const [y, m] = p.month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const a = p.a;
    const cells: ReactNode[] = [];
    for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) cells.push(<span key={`e${i}`} />);
    for (let dd = 1; dd <= n; dd++) {
      const ds = `${p.month}-${String(dd).padStart(2, "0")}`;
      const inA = !!a && ds >= a.from && ds <= a.to;
      const inB = !!cmp && ds >= cmp.from && ds <= cmp.to;
      const cls = [
        "dp-d",
        inA && "in",
        inA && ds === a!.from && "start",
        inA && ds === a!.to && "end",
        inB && "cmp",
        inB && ds === cmp!.from && "cstart",
        inB && ds === cmp!.to && "cend",
        ds === E && "latest",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(
        <button key={ds} type="button" className={cls} aria-label={`${fmtDay(ds)}${ds === E ? " (latest data)" : ""}`} aria-pressed={inA && (ds === a!.from || ds === a!.to)} disabled={ds < MIN || ds > E} onClick={() => clickDay(ds)}>
          <span>{dd}</span>
        </button>,
      );
    }
    return (
      <div className="dp-cal">
        <div className="dp-calnav">
          <button type="button" aria-label="Earlier month" disabled={p.month <= MIN.slice(0, 7)} onClick={() => set({ month: shiftMonth(p.month, -1) })}>
            ‹
          </button>
          <b>{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
          <button type="button" aria-label="Later month" disabled={p.month >= E.slice(0, 7)} onClick={() => set({ month: shiftMonth(p.month, 1) })}>
            ›
          </button>
        </div>
        <div className="dp-grid">
          {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => (
            <span key={i} className="dp-wd">
              {x}
            </span>
          ))}
          {cells}
        </div>
        <p className="dp-help">
          {p.anchor ? "Now click the last day." : p.editing === "b" ? "Clicks set the comparison dates." : "Click a first and a last day."} Data from {fmtDate(MIN)} to {fmtDate(E)}.
        </p>
      </div>
    );
  }

  const dateField = (which: "a" | "b", k: "from" | "to", r: Period | null, locked = false) => (
    <label className="dp-field">
      <span>{k === "from" ? "Start date" : "End date"}</span>
      <input
        type="date"
        value={r?.[k] ?? ""}
        min={which === "a" ? MIN : undefined}
        max={E}
        readOnly={locked}
        onFocus={() => !locked && set({ editing: which })}
        onClick={() => locked && set({ mode: "custom", b: cmp, editing: "b" })}
        onChange={(e) => typed(which, k, e.target.value)}
      />
    </label>
  );

  let summary = "";
  if (pk?.a) {
    const n = days(pk.a.from, pk.a.to);
    const prev = prevOf(pk.a);
    summary = !pk.cmpOn
      ? `${plural(n, "day")}, no comparison`
      : !cmp
        ? `${plural(n, "day")} vs …`
        : pk.mode === "previous" && days(prev.from, prev.to) === n
          ? `${plural(n, "day")} vs the ${plural(n, "day")} before`
          : `${range(pk.a.from, pk.a.to)} vs ${range(cmp.from, cmp.to)}`;
  }
  const early = !!cmp && cmp.from < MIN;

  return (
    <div ref={root} style={{ position: "relative", display: "contents" }}>
      <button className="periodbtn" type="button" aria-expanded={!!pk} aria-haspopup="dialog" onClick={() => (pk ? setPk(null) : openPicker())}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <b>{label}</b>
        <span>{compareLabel ? `vs ${compareLabel}` : "no comparison"}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {pk && (
        <div className="dp" role="dialog" aria-label="Choose dates">
          <div className="dp-left">
            <div className="dp-list" role="group" aria-label="Quick ranges">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="dp-opt"
                  aria-pressed={pk.preset === p.id}
                  disabled={!p.ok}
                  title={p.ok ? range(p.from, p.to) : `Needs data from ${fmtDate(p.from)}; your uploads start ${fmtDate(MIN)}`}
                  onClick={() => set({ preset: p.id, a: { from: p.from, to: p.to }, anchor: null, editing: "a", month: p.to.slice(0, 7) })}
                >
                  <span>{p.name}</span>
                  {!p.ok && <span className="dp-tag">Not enough data</span>}
                </button>
              ))}
              <button type="button" className="dp-opt" aria-pressed={pk.preset === null} onClick={() => set({ preset: null, editing: "a" })}>
                <span>Custom</span>
                <span className="dp-note">pick on the calendar</span>
              </button>
            </div>
            <div className="dp-cmp">
              {/* Off: just the chosen dates, judged against each campaign's own past and your targets. */}
              <label className="dp-switch">
                <span>Compare</span>
                <input type="checkbox" role="switch" checked={pk.cmpOn} onChange={(e) => set({ cmpOn: e.target.checked, editing: "a", anchor: null })} />
              </label>
              {pk.cmpOn &&
                CMP.map(([m, name]) => {
                  const r = pk.a ? compareRange(pk.a, m) : null;
                  const off = m === "year" && !!r && r.to < MIN;
                  return (
                    <button
                      key={m}
                      type="button"
                      className="dp-opt"
                      aria-pressed={pk.cmpOn && pk.mode === m}
                      disabled={off}
                      title={r ? range(r.from, r.to) : "Pick the dates on the calendar"}
                      onClick={() => set(m === "custom" ? { cmpOn: true, mode: m, b: pk.b ?? (pk.a ? compareRange(pk.a, "previous") : null), editing: "b", anchor: null } : { cmpOn: true, mode: m, editing: "a", anchor: null })}
                    >
                      <span>{name}</span>
                      {off && <span className="dp-tag">Not enough data</span>}
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="dp-right">
            <div className="dp-fields">
              {dateField("a", "from", pk.a)}
              {dateField("a", "to", pk.a)}
            </div>
            {pk.cmpOn && (
              <>
                <span className="dp-sub">Compare</span>
                <div className="dp-fields">
                  {dateField("b", "from", cmp, pk.mode !== "custom")}
                  {dateField("b", "to", cmp, pk.mode !== "custom")}
                </div>
                {early && <p className="dp-help">Partly before your first upload ({fmtDate(MIN)}).</p>}
              </>
            )}
            {calendar()}
          </div>
          <div className="dp-foot">
            <span>{summary}</span>
            <button className="btn" type="button" onClick={() => setPk(null)}>
              Cancel
            </button>
            <button className="btn primary" type="button" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
