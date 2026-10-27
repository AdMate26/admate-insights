"use client";

import { useEffect, useRef, useState } from "react";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { DeltaChip, T } from "../bits";
import { DailyChart, goalSeries } from "../charts";
import { PerfOverview } from "../Performance";
import { byGoalSpend, n0, pct, type Row } from "../core";
import { dataUrlBytes, jpegsToPdf } from "../pdf";

// Performance report: a report the person puts together. The dates come from the date
// picker above; here they pick the key metrics, the charts and the written sections,
// add a note, then preview the PDF pages and download them, or copy it as text.
// Every number is the engine's; this page only chooses what to show.

type Col = "spend" | "share" | "results" | "kpi" | "change" | "ctr" | "cpm" | "frequency";
const COLS: [Col, string][] = [
  ["spend", "Spend"],
  ["share", "Share of spend"],
  ["results", "Results"],
  ["kpi", "Main result"],
  ["change", "Change"],
  ["ctr", "CTR"],
  ["cpm", "CPM"],
  ["frequency", "Frequency"],
];
type Sec = "headline" | "changes" | "working" | "doing" | "next" | "caveats";
const SECS: [Sec, string][] = [
  ["headline", "Headline"],
  ["changes", "What changed"],
  ["working", "What’s working"],
  ["doing", "What I’m doing about it"],
  ["next", "Next"],
  ["caveats", "Caveats"],
];
// title "" = the automatic title, which follows the dates.
// A4 at 96 px per inch, with the page margin; drawn at twice that for sharp text.
const PAGE = { w: 794, h: 1123, m: 44, scale: 2 };

type Cfg = { title: string; metrics: string[]; spend: boolean; cards: boolean; chart: boolean; chartGoal: string; byGoal: boolean; table: boolean; cols: Col[]; secs: Sec[]; note: string };

export function PerformanceReport() {
  const { f, ws, cur } = useV5();
  const { vm, toast } = usePage();
  const v = vm!;
  const goals = byGoalSpend(v);
  const fx = v.summaryFacts;
  const initial: Cfg = {
    title: "",
    metrics: goals.slice(0, 3).map((o) => o.objective),
    spend: true,
    cards: true,
    chart: true,
    chartGoal: goals[0]?.objective ?? "",
    byGoal: true,
    table: true,
    cols: ["spend", "share", "results", "kpi", "change"],
    secs: SECS.map(([k]) => k),
    note: "",
  };
  const [c, setC] = useState<Cfg>(initial);
  // The choices (not the numbers) are remembered on this device for next time.
  const store = `admate.report.${ws}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(store) ?? "null") as Partial<Cfg> | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this device's storage after mount
      if (saved) setC((x) => ({ ...x, ...saved }));
    } catch {}
  }, [store]);
  const set = (patch: Partial<Cfg>) =>
    setC((x) => {
      const next = { ...x, ...patch };
      try {
        localStorage.setItem(store, JSON.stringify(next));
      } catch {}
      return next;
    });
  const [prev, setPrev] = useState<null | { busy: boolean; pages: string[]; error?: boolean }>(null);
  const paper = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  // Reset clears every box (and the title and note), so people start from a blank
  // report and tick only what they want. It is offered only when something is ticked.
  const blank: Cfg = { ...initial, metrics: [], spend: false, cards: false, chart: false, byGoal: false, table: false, cols: [], secs: [] };
  const isBlank = !c.spend && !c.metrics.length && !c.cards && !c.chart && !c.byGoal && !c.table && !c.secs.length && !c.title && !c.note.trim();
  const toggle = <T extends string>(list: T[], k: T) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const picked = goals.filter((o) => c.metrics.includes(o.objective));
  const chartGoal = goals.find((o) => o.objective === c.chartGoal) ?? goals[0];
  const camps = [...v.levels.campaign].filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
  const cell = (r: Row, k: Col) =>
    k === "spend" ? f.money(r.spend) : k === "share" ? pct(r.share, 1) : k === "results" ? n0(r.results) : k === "kpi" ? `${r.kpiShort} ${f.kpi(r.kpi, r.mode)}` : k === "ctr" ? pct(r.ctr, 2) : k === "cpm" ? (r.cpm == null ? "—" : f.money(r.cpm)) : k === "frequency" ? (r.frequency == null ? "—" : r.frequency.toFixed(2)) : null;
  const list = (k: Sec): string[] => (k === "changes" ? (fx.changes.length ? fx.changes : ["No comparable earlier period yet."]) : k === "working" ? [fx.working ?? "Nothing stands out as a clear winner this period."] : k === "doing" ? (fx.doing.length ? fx.doing : ["Nothing needs changing right now; keep monitoring."]) : k === "next" ? fx.next : k === "caveats" ? fx.caveats : []);
  const period = `${v.label}${v.compareLabel ? ` vs ${v.compareLabel}` : ""}`;

  const title = c.title || fx.title;
  const copy = () => {
    const out = [title, period, ""];
    if (c.secs.includes("headline")) out.push(fx.headline, "");
    if (c.spend) out.push(`Spend: ${f.money(v.spend)}`);
    for (const o of picked) out.push(`${o.label} · ${o.kpiShort}: ${o.kpiMissing ? "—" : f.kpi(o.value, o.mode)}${o.previous != null && v.compareLabel ? ` (was ${f.kpi(o.previous, o.mode)})` : ""}`);
    if (c.table && camps.length) {
      out.push("", "Campaigns:");
      for (const r of camps) out.push(`- ${r.name}: ${c.cols.map((k) => (k === "change" ? (r.change == null ? "—" : `${r.change > 0 ? "+" : ""}${Math.round(r.change * 100)}%`) : cell(r, k))).join(" · ")}`);
    }
    for (const [k, name] of SECS) if (k !== "headline" && c.secs.includes(k) && list(k).length) out.push("", `${name}:`, ...list(k).map((x) => `- ${x}`));
    if (c.note.trim()) out.push("", "Note:", c.note.trim());
    navigator.clipboard?.writeText(out.join("\n")).then(
      () => toast("Copied as text"),
      () => toast("Your browser blocked copying here."),
    );
  };

  const empty = !c.spend && !picked.length && !c.chart && !c.byGoal && !(c.table && c.cols.length) && !c.secs.length && !c.note.trim();
  const doc = !goals.length ? null : (
    <>
      <header className="rp-head">
        <span className="label">Performance report</span>
        <h2>{title}</h2>
        <span className="muted">
          {period} · all amounts in {cur}
        </span>
      </header>
      {empty && <p className="empty">Nothing in the report yet. Tick the key metrics, visuals and sections you want on the left.</p>}
      {c.secs.includes("headline") && <p className="rp-say">{fx.headline}</p>}
      {c.cards && (c.spend || picked.length > 0) && <PerfOverview goals={picked} all={goals} spendCard={c.spend} />}
      {!c.cards && (c.spend || picked.length > 0) && (
        <div className="rp-kpis">
          {c.spend && (
            <div>
              <span>Amount spent</span>
              <b className="num">{f.money(v.spend)}</b>
              <DeltaChip change={v.spendChange} mode="neutral" />
            </div>
          )}
          {picked.map((o) => (
            <div key={o.objective}>
              <span>
                {o.label} · <T s={o.kpiShort} />
              </span>
              <b className="num">{o.kpiMissing ? "—" : f.kpi(o.value, o.mode)}</b>
              <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />
            </div>
          ))}
        </div>
      )}
      {c.chart && (
        <section className="rp-sec">
          <h3>
            {chartGoal.label}: {chartGoal.resultLabel} per day and <T s={chartGoal.kpiShort} />
          </h3>
          <div className="chartbox">
            <DailyChart series={goalSeries(chartGoal)} from={v.from} to={v.to} h={190} />
          </div>
        </section>
      )}
      {c.byGoal && (
        <section className="rp-sec">
          <h3>Spend by goal</h3>
          <div className="geo-list">
            {goals.map((o, i) => (
              <div key={o.objective} className="geo-row">
                <span className="num geo-n">{i + 1}</span>
                <span className="geo-name">{o.label}</span>
                <span className="geo-bar">
                  <i style={{ width: `${(o.share / (goals[0].share || 1)) * 100}%`, background: `var(--cat${(i % 7) + 1})` }} />
                </span>
                <span className="num">{f.money(o.spend)}</span>
                <span className="num muted">{pct(o.share)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {c.table && camps.length > 0 && c.cols.length > 0 && (
        <section className="rp-sec">
          <h3>Top campaigns</h3>
          <div className="tablewrap">
            <table className="tbl dense">
              <thead>
                <tr>
                  <th>Campaign</th>
                  {COLS.filter(([k]) => c.cols.includes(k)).map(([k, name]) => (
                    <th key={k} className="r">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {camps.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b style={{ fontWeight: 500 }}>{r.name}</b>
                    </td>
                    {COLS.filter(([k]) => c.cols.includes(k)).map(([k]) => (
                      <td key={k} className="r num">
                        {k === "change" ? <DeltaChip change={r.change} mode={r.mode} confidence={r.confidence} /> : cell(r, k)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {SECS.filter(([k]) => k !== "headline" && c.secs.includes(k) && list(k).length > 0).map(([k, name]) => (
        <section key={k} className="rp-sec">
          <h3>{name}</h3>
          <ul>
            {list(k).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ))}
      {c.note.trim() && (
        <section className="rp-sec">
          <h3>Note</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{c.note.trim()}</p>
        </section>
      )}
      <p className="small-note">Written from your numbers for {period}. Looking back only, not a forecast.</p>
    </>
  );

  // Preview: draw the document into A4 pages. Breaks fall between blocks (a chart,
  // a table, a section), never through one, unless a block is taller than a page.
  const openPreview = () => setPrev({ busy: true, pages: [] });
  useEffect(() => {
    if (!prev?.busy) return;
    let live = true;
    (async () => {
      try {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await document.fonts?.ready;
        const node = paper.current;
        if (!node) throw new Error("no paper");
        const { toCanvas } = await import("html-to-image");
        // The copy sits off screen; draw it as if it were in place.
        const full = await toCanvas(node, { pixelRatio: PAGE.scale, backgroundColor: "#ffffff", width: PAGE.w, height: node.scrollHeight, style: { position: "static", left: "0", top: "0", margin: "0" } });
        const top0 = node.getBoundingClientRect().top;
        const usable = PAGE.h - 2 * PAGE.m - 16;
        const cuts: [number, number][] = [];
        let start = 0;
        for (const el of Array.from(node.children)) {
          const r = el.getBoundingClientRect();
          const top = r.top - top0;
          const bottom = r.bottom - top0;
          if (bottom - start > usable && top > start) {
            cuts.push([start, top]);
            start = top;
          }
          while (bottom - start > usable) {
            cuts.push([start, start + usable]);
            start += usable;
          }
        }
        const end = node.scrollHeight;
        if (end > start) cuts.push([start, end]);
        const S = PAGE.scale;
        const pages = cuts.map(([a, z], k) => {
          const cv = document.createElement("canvas");
          cv.width = PAGE.w * S;
          cv.height = PAGE.h * S;
          const ctx = cv.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(full, 0, a * S, full.width, (z - a) * S, 0, PAGE.m * S, full.width, (z - a) * S);
          ctx.fillStyle = "#8a8a9e";
          ctx.font = `${11 * S}px sans-serif`;
          const y = (PAGE.h - PAGE.m / 2) * S;
          ctx.fillText(title.length > 80 ? `${title.slice(0, 79)}…` : title, PAGE.m * S, y);
          ctx.textAlign = "right";
          ctx.fillText(`Page ${k + 1} of ${cuts.length}`, (PAGE.w - PAGE.m) * S, y);
          return cv.toDataURL("image/jpeg", 0.92);
        });
        if (live) setPrev({ busy: false, pages });
      } catch (err) {
        console.warn("[admate] report preview failed:", err);
        if (live) setPrev({ busy: false, pages: [], error: true });
      }
    })();
    return () => {
      live = false;
    };
    // Draw once per opening; the document can't change while the preview is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev?.busy]);
  useEffect(() => {
    if (!prev) return;
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPrev(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prev]);
  const download = () => {
    if (!prev?.pages.length) return;
    const pdf = jpegsToPdf(prev.pages.map(dataUrlBytes), PAGE.w * PAGE.scale, PAGE.h * PAGE.scale);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pdf);
    a.download = `${title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || "AdMate report"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Report downloaded");
  };

  if (!goals.length) return <p className="empty">No ad spend in this period. Pick other dates above.</p>;
  return (
    <div className="rp">
      <aside className="rp-build" aria-label="Build the report">
        <h2>Build your report</h2>
        <p className="small-note">Dates: use the date picker at the top. Your choices are kept on this device.</p>
        <label className="rp-field">
          <span>Title</span>
          <input className="inp" value={title} onChange={(e) => set({ title: e.target.value === fx.title ? "" : e.target.value })} />
        </label>
        <fieldset className="rp-set">
          <legend>Key metrics</legend>
          <label>
            <input type="checkbox" checked={c.spend} onChange={() => set({ spend: !c.spend })} /> Amount spent
          </label>
          {goals.map((o) => (
            <label key={o.objective}>
              <input type="checkbox" checked={c.metrics.includes(o.objective)} onChange={() => set({ metrics: toggle(c.metrics, o.objective) })} /> {o.label} · {o.kpiShort}
            </label>
          ))}
        </fieldset>
        <fieldset className="rp-set">
          <legend>Visuals</legend>
          <label>
            <input type="checkbox" checked={c.cards} onChange={() => set({ cards: !c.cards })} /> Metric cards with trend lines
          </label>
          <label>
            <input type="checkbox" checked={c.chart} onChange={() => set({ chart: !c.chart })} /> Daily chart
          </label>
          {c.chart && (
            <select className="sel" aria-label="Goal for the daily chart" value={chartGoal.objective} onChange={(e) => set({ chartGoal: e.target.value })}>
              {goals.map((o) => (
                <option key={o.objective} value={o.objective}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <label>
            <input type="checkbox" checked={c.byGoal} onChange={() => set({ byGoal: !c.byGoal })} /> Spend by goal
          </label>
          <label>
            <input type="checkbox" checked={c.table} onChange={() => set({ table: !c.table, cols: !c.table && !c.cols.length ? initial.cols : c.cols })} /> Top campaigns table
          </label>
          {c.table && (
            <div className="rp-cols">
              {COLS.map(([k, name]) => (
                <label key={k}>
                  <input type="checkbox" checked={c.cols.includes(k)} onChange={() => set({ cols: toggle(c.cols, k) })} /> {name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="rp-set">
          <legend>Written sections</legend>
          {SECS.map(([k, name]) => (
            <label key={k}>
              <input type="checkbox" checked={c.secs.includes(k)} onChange={() => set({ secs: toggle(c.secs, k) })} /> {name}
            </label>
          ))}
        </fieldset>
        <label className="rp-field">
          <span>Your note (optional)</span>
          <textarea className="inp" rows={4} value={c.note} placeholder="Anything you want to add for your team or client" onChange={(e) => set({ note: e.target.value })} />
        </label>
        <div className="rp-acts">
          <button className="btn primary" type="button" disabled={empty} title={empty ? "Tick something to put in the report first" : undefined} onClick={openPreview}>
            Preview & download
          </button>
          <button className="btn" type="button" onClick={copy}>
            Copy as text
          </button>
          <button
            className="btn"
            type="button"
            disabled={isBlank}
            title={isBlank ? "Nothing is ticked yet" : "Untick every box and clear the title and note, to start a new report"}
            onClick={() => {
              set(blank);
              toast("Cleared. Tick what you want in the report.");
            }}
          >
            Reset choices
          </button>
        </div>
      </aside>

      <article className="rp-doc paper print-root" aria-label="Report">
        {doc}
      </article>
      {prev && (
        <>
          {/* The same document at A4 width, off screen, drawn into the PDF pages. */}
          <div ref={paper} className="rp-paper paper" aria-hidden="true">
            {doc}
          </div>
          <div className="scrim" onClick={() => setPrev(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rpv-t" onClick={(e) => e.target === e.currentTarget && setPrev(null)}>
            <article className="mbox rp-prev">
              <header>
                <div>
                  <span className="label">Preview</span>
                  <h2 id="rpv-t">{title}</h2>
                  <span className="small-note">{prev.busy ? "Preparing the pages…" : prev.error ? "The pages couldn’t be prepared." : `${prev.pages.length} ${prev.pages.length === 1 ? "page" : "pages"} · A4 PDF · exactly what you’ll download`}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary" type="button" disabled={prev.busy || !prev.pages.length} onClick={download}>
                    Download PDF
                  </button>
                  <button className="btn" type="button" ref={backRef} onClick={() => setPrev(null)}>
                    Back to editing
                  </button>
                </div>
              </header>
              <div className="mbody rp-pages">
                {prev.busy && <p className="empty">Preparing your report…</p>}
                {prev.error && <p className="empty">Something stopped the pages from being drawn. Try again, or use Copy as text.</p>}
                {prev.pages.map((src, k) => (
                  // A data: URL of a drawn page; next/image can't optimise it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={k} src={src} alt={`Page ${k + 1} of ${prev.pages.length}`} width={PAGE.w} height={PAGE.h} />
                ))}
              </div>
            </article>
          </div>
        </>
      )}
    </div>
  );
}
