"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useV5 } from "./ctx";
import { usePage } from "./page";
import { choices, days, fmtDate, fmtDay, guessKind, iso, plural, presetName, prevOf, range, type Period } from "./core";

// The page header (prototype renderHead): the account above the page title, the date
// picker and the summary report on the right, and the line saying what is compared.
export function PageHead({ title, eyebrow, withPeriod = true, summary = true, right }: { title: string; eyebrow?: string; withPeriod?: boolean; summary?: boolean; right?: ReactNode }) {
  const { name, isBeg, isAdv, end, min } = useV5();
  const { vm: v, openSummary } = usePage();
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
          {showPeriod && summary && (
            <button className="btn" type="button" onClick={openSummary}>
              {isBeg ? "Share a summary" : "Summary report"}
            </button>
          )}
          {right}
        </div>
      </div>
      {ctx && <div className="ctx">{ctx}</div>}
    </>
  );
}

type Pk = { aKind: string; a: Period | null; cmp: string; bKind: string; b: Period | null; cal: Record<string, { month: string; anchor: string | null }> };

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
  const openPicker = () => {
    const a = { from: v!.from, to: v!.to };
    const cmpP = search.get("cmp") === "none" ? "none" : search.get("cmp") === "custom" ? "pick" : "previous";
    const b = cmpP === "pick" && search.get("cfrom") && search.get("cto") ? { from: search.get("cfrom")!, to: search.get("cto")! } : null;
    setPk({ aKind: guessKind(a, E, MIN), a, cmp: cmpP, bKind: b ? guessKind(b, E, MIN) : guessKind(a, E, MIN), b, cal: {} });
  };
  const apply = () => {
    if (!pk) return;
    if (pk.cmp === "pick" && !pk.b) return toast("Choose the period to compare with first");
    if (!pk.a || pk.cal.a?.anchor) return toast("Click a first and a last day on the calendar");
    const q = new URLSearchParams();
    // Keep anything that isn't the period (e.g. a tab), drop the item panel and report mode.
    for (const [k, val] of search.entries()) if (!["from", "to", "cmp", "cfrom", "cto", "report", "vs", "open"].includes(k)) q.set(k, val);
    q.set("from", pk.a.from);
    q.set("to", pk.a.to);
    if (pk.cmp === "none") q.set("cmp", "none");
    else if (pk.cmp === "pick" && pk.b) {
      q.set("cmp", "custom");
      q.set("cfrom", pk.b.from);
      q.set("cto", pk.b.to);
    }
    setPk(null);
    router.push(`${path}?${q}`, { scroll: false });
  };
  const set = (patch: Partial<Pk>) => setPk((p) => (p ? { ...p, ...patch } : p));

  function chooser(which: "a" | "b") {
    const p = pk!;
    const kind = which === "a" ? p.aKind : p.bKind;
    const cur = p[which];
    const list = kind === "custom" ? [] : choices(kind, E, MIN);
    return (
      <>
        <div className="seg" role="group" aria-label="Period type">
          {["day", "week", "month", "custom"].map((k) => (
            <button key={k} type="button" aria-pressed={k === kind} onClick={() => set(which === "a" ? { aKind: k } : { bKind: k })}>
              {({ day: "Day", week: "Week", month: "Month", custom: "Calendar" } as Record<string, string>)[k]}
            </button>
          ))}
        </div>
        {kind === "custom" ? (
          calendar(which)
        ) : (
          <div className="choices">
            {list.map((c, i) => (
              <button key={i} type="button" aria-pressed={!!cur && cur.from === c.from && cur.to === c.to} onClick={() => set({ [which]: { from: c.from, to: c.to, name: c.name } })}>
                {c.name}
                {c.small && <small>{c.small}</small>}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }
  // Two months side by side; click the first day, then the last day.
  function calendar(which: "a" | "b") {
    const p = pk!;
    const cur = p[which];
    const c = p.cal[which] ?? { month: (cur?.to && cur.to <= E ? cur.to : E).slice(0, 7), anchor: null };
    const shown = c.anchor ? { from: c.anchor, to: c.anchor } : cur;
    const shift = (ym: string, n: number) => {
      const [y, m] = ym.split("-").map(Number);
      return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
    };
    const setCal = (cal: { month: string; anchor: string | null }) => set({ cal: { ...p.cal, [which]: cal } });
    const click = (ds: string) => {
      if (!c.anchor) set({ cal: { ...p.cal, [which]: { ...c, anchor: ds } }, [which]: { from: ds, to: ds, name: fmtDay(ds) } });
      else {
        const from = ds < c.anchor ? ds : c.anchor;
        const to = ds < c.anchor ? c.anchor : ds;
        set({ cal: { ...p.cal, [which]: { ...c, anchor: null } }, [which]: { from, to, name: range(from, to) } });
      }
    };
    const month = (ym: string) => {
      const [y, m] = ym.split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 1, 1));
      const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const cells: ReactNode[] = [];
      for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) cells.push(<span key={`e${i}`} />);
      for (let dd = 1; dd <= n; dd++) {
        const ds = `${ym}-${String(dd).padStart(2, "0")}`;
        const inR = !!shown && ds >= shown.from && ds <= shown.to;
        const edge = !!shown && (ds === shown.from || ds === shown.to);
        cells.push(
          <button key={ds} type="button" className={`cd${inR ? " in" : ""}${edge ? " edge" : ""}${ds === E ? " today" : ""}`} aria-label={`${fmtDay(ds)}${ds === E ? " (latest data)" : ""}`} aria-pressed={edge} disabled={ds < MIN || ds > E} onClick={() => click(ds)}>
            {dd}
          </button>,
        );
      }
      return (
        <div className="cal-m" key={ym}>
          <b>{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
          <div className="cal-g">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x) => (
              <span key={x}>{x}</span>
            ))}
            {cells}
          </div>
        </div>
      );
    };
    const left = shift(c.month, -1);
    return (
      <div className="cal">
        <div className="cal-nav">
          <button type="button" aria-label="Earlier months" disabled={left <= MIN.slice(0, 7)} onClick={() => setCal({ ...c, month: shift(c.month, -1) })}>
            ‹
          </button>
          <span>{c.anchor ? "Now click the last day" : "Click the first day, then the last day"}</span>
          <button type="button" aria-label="Later months" disabled={c.month >= E.slice(0, 7)} onClick={() => setCal({ ...c, month: shift(c.month, 1) })}>
            ›
          </button>
        </div>
        <div className="cal-ms">
          {month(left)}
          {month(c.month)}
        </div>
        <p className="cal-sum">
          {cur && !c.anchor ? (
            <>
              Selected: <b>{range(cur.from, cur.to)}</b> · {plural(days(cur.from, cur.to), "day")}
            </>
          ) : c.anchor ? (
            <>
              Starts <b>{fmtDay(c.anchor)}</b>…
            </>
          ) : (
            "Nothing selected yet."
          )}{" "}
          <span className="small-note">
            Data from {fmtDate(MIN)} to {fmtDate(E)}.
          </span>
        </p>
      </div>
    );
  }

  const prev = pk?.a ? prevOf(pk.a) : null;
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
        <div className="picker" role="dialog" aria-label="Choose periods">
          <div className="pk">
            <h4>1. Show</h4>
            {chooser("a")}
          </div>
          <div className="pk">
            <h4>2. Compare with</h4>
            <div className="radios">
              <label>
                <input type="radio" name="pkcmp" value="previous" checked={pk.cmp === "previous"} onChange={() => set({ cmp: "previous" })} />
                <span>
                  The period right before
                  {prev && (
                    <small>
                      {range(prev.from, prev.to)}
                      {prev.from < MIN ? " · partly before your first upload" : ""}
                    </small>
                  )}
                </span>
              </label>
              <label>
                <input type="radio" name="pkcmp" value="pick" checked={pk.cmp === "pick"} onChange={() => set({ cmp: "pick" })} />
                <span>
                  Another period I choose<small>e.g. this Tuesday vs last Tuesday, or October vs August</small>
                </span>
              </label>
              <label>
                <input type="radio" name="pkcmp" value="none" checked={pk.cmp === "none"} onChange={() => set({ cmp: "none" })} />
                <span>
                  Don’t compare<small>Judged against each campaign’s own past and your targets</small>
                </span>
              </label>
            </div>
            {pk.cmp === "pick" && chooser("b")}
          </div>
          <div className="pickfoot">
            <span>
              Data from {fmtDate(MIN)} to {fmtDate(E)}
            </span>
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
