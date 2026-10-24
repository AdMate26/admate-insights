"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { ConfDots, Empty, ImpactChip, KindTag, Legend, PathCrumbs, PrioChip, SectionHead } from "../bits";
import { ORow, TCard } from "../rows";
import { decidedItems, decisions, DETECTOR_NAME, isOpen, kindOf, optimizeQueue, plain, plural, statusText, type Item } from "../core";

// The decisions page of each view: Beginner To-do, Intermediate Optimize and the
// Advanced Actions work queue with bulk decisions.

// ---------- Beginner: Things to do ----------
export function BegTodo() {
  const { shown } = useV5();
  const { vm, decide } = usePage();
  const v = vm!;
  const list = decisions(v, shown);
  const done = decidedItems(v);
  const watching = v.signals.filter(isOpen).length + [...v.problems, ...v.opportunities].filter((d) => isOpen(d) && shown(d) && d.priority === "low").length;
  return (
    <>
      <section className="section">
        <SectionHead title="Things to do" hint="Most important first, with the steps. Tick them off as you go." />
        {list.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {list.map((d, i) => (
              <TCard key={d.key} d={d} i={i} />
            ))}
          </div>
        ) : (
          <Empty title="You’re all done for now" text="AdMate checks again after your next upload." />
        )}
        {watching > 0 && <p className="small-note">AdMate is also keeping an eye on {plural(watching, "smaller thing")}. Nothing to do about them yet.</p>}
      </section>
      {done.length > 0 && (
        <section className="section">
          <SectionHead title={`Done and reminders (${done.length})`} hint="AdMate checks whether each change worked after your next upload." />
          <div className="rows">
            {done.map((d) => (
              <div key={d.key} className={`irow closed ${d.priority}`}>
                <span className="body">
                  <span className="t">{plain(d.title)}</span>
                  <span className="sub">{statusText(d)}</span>
                </span>
                <span className="side-r">
                  <button className="btn small" type="button" onClick={() => decide(d.key, "restore")}>
                    Undo
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------- Intermediate: Optimize ----------
const OPT_NAMES: Record<string, string> = { open: "All open", fix: "Fix problems", grow: "Grow", watch: "Watch", done: "Done & reminders" };
const OPT_EMPTY: Record<string, string> = {
  open: "Nothing to optimize right now.",
  fix: "No open problems.",
  grow: "No open opportunities.",
  watch: "Nothing to watch: early signals appear here before they’re confirmed.",
  done: "Nothing yet. Open an item and choose Action taken, Remind me later or Dismiss.",
};
export function IntOptimize() {
  const { shown } = useV5();
  const { vm } = usePage();
  const search = useSearchParams();
  const v = vm!;
  const [filter, setFilter] = useState(OPT_NAMES[search.get("f") ?? ""] ? search.get("f")! : "open");
  const [sort, setSort] = useState("impact");
  const counts = Object.fromEntries(Object.keys(OPT_NAMES).map((k) => [k, optimizeQueue(v, k, "impact", shown).length]));
  const list = optimizeQueue(v, filter, sort, shown);
  return (
    <section className="section">
      <SectionHead title="Optimize" hint="Every problem and opportunity once, ranked by the money involved. Open one to investigate why." />
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Show">
          {Object.keys(OPT_NAMES).map((k) => (
            <button key={k} type="button" aria-pressed={k === filter} onClick={() => setFilter(k)}>
              {OPT_NAMES[k]} <span className="num">{counts[k]}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <label className="toggle">
          Sort by{" "}
          <select className="sel" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="impact">Money at stake</option>
            <option value="priority">Priority</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>
      </div>
      <Legend />
      {list.length ? (
        <div className="rows">
          {list.map((d, i) => (
            <ORow key={d.key} d={d} i={i} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing here" text={OPT_EMPTY[filter]} />
      )}
      <p className="small-note">Money at stake looks back only: the extra cost, lost revenue or savings against what AdMate expected (an item’s own past, your target or similar items). It is not a forecast.</p>
    </section>
  );
}

// ---------- Advanced: Actions (a work queue with bulk decisions) ----------
const ACT_NAMES: Record<string, string> = { open: "Open", fix: "Problems", grow: "Opportunities", watch: "Watch", done: "Done" };
export function AdvActions() {
  const { shown } = useV5();
  const { vm, open, decideMany, toast } = usePage();
  const search = useSearchParams();
  const v = vm!;
  const [filter, setFilter] = useState(ACT_NAMES[search.get("f") ?? ""] ? search.get("f")! : "open");
  const [sort, setSort] = useState("impact");
  const [prio, setPrio] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  let list: Item[] = optimizeQueue(v, filter, sort, shown);
  if (prio !== "all") list = list.filter((d) => d.priority === prio);
  const qq = q.trim().toLowerCase();
  if (qq) list = list.filter((d) => `${d.title} ${d.where ?? ""}`.toLowerCase().includes(qq));
  const selected = [...sel].filter((k) => list.some((d) => d.key === k));
  const counts = Object.fromEntries(Object.keys(ACT_NAMES).map((k) => [k, optimizeQueue(v, k, "impact", shown).length]));
  const n = selected.length;
  const toggle = (k: string, on: boolean) =>
    setSel((s) => {
      const x = new Set(s);
      if (on) x.add(k);
      else x.delete(k);
      return x;
    });
  const bulk = async (kind: string) => {
    if (kind === "clear") return setSel(new Set());
    const keys = selected;
    setSel(new Set());
    toast(`${plural(keys.length, "item")}: ${kind === "done" ? "marked as action taken" : kind === "remind" ? "reminder in 3 days" : kind === "restore" ? "back on the list" : "dismissed"}`);
    await decideMany(keys, kind, kind === "remind" ? 3 : kind === "dismissed" ? "Not relevant" : undefined);
  };
  return (
    <section className="section">
      <SectionHead title="Actions" hint="Every item once. Tick several to decide in bulk; click a row to investigate." />
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Show">
          {Object.keys(ACT_NAMES).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === filter}
              onClick={() => {
                setFilter(k);
                setSel(new Set());
              }}
            >
              {ACT_NAMES[k]} <span className="num">{counts[k]}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <select className="sel" aria-label="Priority" value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="all">All priorities</option>
          {["high", "medium", "low"].map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)} only
            </option>
          ))}
        </select>
        <select className="sel" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="impact">Sort: money at stake</option>
          <option value="priority">Sort: priority</option>
          <option value="confidence">Sort: confidence</option>
        </select>
        <input className="inp" id="actQ" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search actions" />
      </div>
      {list.length ? (
        <div className="tablewrap">
          <table className="tbl dense" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all" checked={n > 0 && n === list.length} onChange={(e) => setSel(e.target.checked ? new Set(list.map((d) => d.key)) : new Set())} />
                </th>
                <th>Priority</th>
                <th>Item</th>
                <th>Check</th>
                <th className="r">Money at stake</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.key} className={`click${sel.has(d.key) ? " sel" : ""}`} tabIndex={0} onClick={(e) => !(e.target as HTMLElement).closest("input") && open(d.key)} onKeyDown={(e) => e.key === "Enter" && open(d.key)}>
                  <td>
                    <input type="checkbox" aria-label="Select" checked={sel.has(d.key)} onChange={(e) => toggle(d.key, e.target.checked)} />
                  </td>
                  <td>
                    <PrioChip p={d.priority} />
                  </td>
                  <td>
                    <div className="nm">
                      <KindTag kind={kindOf(d)} /> {d.title}
                    </div>
                    {d.where && (
                      <div className="sub">
                        <PathCrumbs where={d.where} />
                      </div>
                    )}
                  </td>
                  <td className="small">{DETECTOR_NAME[d.detector] ?? d.detector}</td>
                  <td className="r">{d.impact && d.impact.amount > 0 ? <ImpactChip impact={d.impact} /> : <span className="muted">—</span>}</td>
                  <td>
                    <ConfDots c={d.confidence} />
                  </td>
                  <td className="small">{isOpen(d) ? "Open" : statusText(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Nothing here" text="No items match these filters." />
      )}
      {n > 0 && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <span>{plural(n, "item")} selected</span>
          {filter === "done" ? (
            <button className="btn small" type="button" onClick={() => bulk("restore")}>
              Undo
            </button>
          ) : (
            <>
              <button className="btn small" type="button" onClick={() => bulk("done")}>
                Action taken
              </button>
              <button className="btn small" type="button" onClick={() => bulk("remind")}>
                Remind in 3 days
              </button>
              <button className="btn small" type="button" onClick={() => bulk("dismissed")}>
                Dismiss
              </button>
            </>
          )}
          <button className="btn small" type="button" onClick={() => bulk("clear")}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
