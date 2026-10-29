"use client";

import { useRef, useState, useTransition } from "react";
import { deleteView, saveView } from "@/app/actions";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { ConfDots, DeltaChip, Empty, ImpactChip, PrioChip, SectionHead, T } from "../bits";
import { CONF_RANK, detailOf, higher, isOpen, keyForEntity, LEVEL, n0, n1, pct, plural, PLATFORM, PRIO_RANK, ROLE, signed, type Fmt, type Row } from "../core";
import { DEFAULT_COLS, DEFAULT_EX, QUICK_VIEWS, type ExCol, type ExState } from "@/lib/explorer";
import { OBJECTIVE_DEFS, type Objective } from "@/lib/metrics/objectives";

// Advanced · Explorer (prototype advExplorer): build the table you need — level,
// columns, filters, grouping — and save it as a view that follows you to every account.

type Col = { label: string; get: (r: Row) => number | string | null; txt?: boolean; fmt?: (x: never, r: Row, f: Fmt) => React.ReactNode; csv?: (r: Row) => number | string | null };
const COLS: Record<ExCol, Col> = {
  platform: { label: "Platform", get: (r) => PLATFORM[r.platform] ?? r.platform, txt: true },
  objective: { label: "Goal", get: (r) => r.objectiveLabel, txt: true },
  role: { label: "Funnel role", get: (r) => ROLE[r.role] ?? r.role, txt: true },
  spend: { label: "Spend", get: (r) => r.spend, fmt: (x: number, _r, f) => f.money(x) },
  share: { label: "Share", get: (r) => r.share, fmt: (x: number) => pct(x, 1) },
  spendChange: { label: "Spend Δ", get: (r) => r.spendChange, fmt: (x: number | null) => (x == null ? "—" : signed(x)) },
  impressions: { label: "Impr.", get: (r) => r.impressions, fmt: (x: number) => n0(x) },
  reach: { label: "Reach", get: (r) => r.reach, fmt: (x: number) => n0(x) },
  frequency: { label: "Freq.", get: (r) => r.frequency, fmt: (x: number | null) => n1(x) },
  clicks: { label: "Clicks", get: (r) => r.clicks, fmt: (x: number) => n0(x) },
  ctr: { label: "CTR", get: (r) => r.ctr, fmt: (x: number | null) => pct(x, 2) },
  cpc: { label: "CPC", get: (r) => r.cpc, fmt: (x: number | null, _r, f) => f.money(x) },
  cpm: { label: "CPM", get: (r) => r.cpm, fmt: (x: number | null, _r, f) => f.money(x) },
  results: { label: "Results", get: (r) => (r.mode === "cpm" ? null : r.results), fmt: (x: number | null) => n0(x) },
  cvr: { label: "Conv. rate", get: (r) => r.cvr, fmt: (x: number | null) => pct(x, 1) },
  kpi: { label: "Main result", get: (r) => r.kpi, fmt: (x: number | null, r, f) => `${r.kpiShort} ${f.kpi(x, r.mode)}` },
  change: { label: "Δ main", get: (r) => (r.change == null ? null : higher(r.mode) ? r.change : -r.change), fmt: (_x, r) => <DeltaChip change={r.change} mode={r.mode} confidence={r.confidence} />, csv: (r) => r.change },
  expected: { label: "Expected", get: (r) => r.expected, fmt: (x: number | null, r, f) => f.kpi(x, r.mode) },
  impact: {
    label: "Money at stake",
    get: (r) => (r.impact ? (r.impact.label === "extra cost" || r.impact.label === "lost revenue" ? r.impact.amount : -r.impact.amount) : null),
    fmt: (_x, r) => (r.impact ? <ImpactChip impact={r.impact} /> : "—"),
  },
  priority: { label: "Priority", get: (r) => PRIO_RANK[r.priority ?? ""] ?? 9, fmt: (_x, r) => <PrioChip p={r.priority} />, csv: (r) => r.priority ?? "" },
  confidence: { label: "Conf.", get: (r) => CONF_RANK[r.confidence] ?? 9, fmt: (_x, r) => <ConfDots c={r.confidence} />, csv: (r) => r.confidence },
  next: { label: "Next step", get: (r) => r.label ?? "", txt: true },
};

export function Explorer({ saved: initialSaved }: { saved: { id: string; name: string; config: ExState }[] }) {
  const { f, name: account, shown, readOnly, nudge } = useV5();
  const { vm, open, decideMany, toast } = usePage();
  const v = vm!;
  const [e, setE] = useState<ExState>(DEFAULT_EX);
  const [active, setActive] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ExState>, keepActive = false) => {
    setE((x) => ({ ...x, ...patch }));
    if (!keepActive) setActive(null);
  };
  const q = e.q.trim().toLowerCase();
  const issueIds = new Set(v.problems.filter((p) => isOpen(p) && shown(p) && p.entity).map((p) => p.entity!.id));
  let rows = v.levels[e.level].filter(
    (r) =>
      (!q || `${r.name} ${r.campaignName ?? ""} ${r.adSetName ?? ""}`.toLowerCase().includes(q)) &&
      (!e.obj || r.objective === e.obj) &&
      (!e.plat || r.platform === e.plat) &&
      (e.prio === "all" || r.priority === e.prio) &&
      (!e.issues || r.kind === "issue" || issueIds.has(r.id)),
  );
  const col = e.sort.key === "name" ? { get: (r: Row) => r.name } : COLS[e.sort.key];
  rows = [...rows].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * e.sort.dir;
  });
  const selected = [...sel].filter((id) => rows.some((r) => r.id === id));
  const objs = [...new Set(v.levels.campaign.map((r) => r.objective))];
  const plats = [...new Set(v.levels.campaign.map((r) => r.platform))];
  const groupKey = (r: Row) => (e.group === "objective" ? r.objectiveLabel : e.group === "platform" ? (PLATFORM[r.platform] ?? r.platform) : e.group === "role" ? ROLE[r.role] : e.group === "campaign" ? (r.campaignName ?? r.name) : "");
  const subtotal = (list: Row[]) => {
    const spend = list.reduce((s, r) => s + r.spend, 0);
    const same = list.every((r) => r.mode === list[0].mode && r.objective === list[0].objective);
    const results = list.every((r) => r.results !== null) ? list.reduce((s, r) => s + (r.results ?? 0), 0) : null;
    const revenue = list.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const k = !same || !list.length ? null : list[0].mode === "roas" ? (spend > 0 ? revenue / spend : null) : list[0].mode === "cpm" ? null : results ? spend / results : null;
    return { spend, results: same ? results : null, kpi: k, mode: list[0]?.mode, kpiShort: list[0]?.kpiShort };
  };
  const cell = (r: Row, c: ExCol) => {
    const cc = COLS[c];
    const x = cc.get(r);
    return (
      <td key={c} className={cc.txt ? "" : "r num"}>
        {cc.fmt ? cc.fmt(x as never, r, f) : String(x ?? "")}
      </td>
    );
  };
  const toggleSel = (id: string, on: boolean) =>
    setSel((s) => {
      const x = new Set(s);
      if (on) x.add(id);
      else x.delete(id);
      return x;
    });
  const rowEl = (r: Row) => (
    <tr key={r.id} className={`click${sel.has(r.id) ? " sel" : ""}`} tabIndex={0} onClick={(ev) => !(ev.target as HTMLElement).closest("input") && open(null, { entity: { level: r.level, id: r.id } })} onKeyDown={(ev) => ev.key === "Enter" && open(null, { entity: { level: r.level, id: r.id } })}>
      <td>
        <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={(ev) => toggleSel(r.id, ev.target.checked)} />
      </td>
      <td>
        <div className="nm">{r.name}</div>
        {r.level !== "campaign" && (
          <div className="sub">
            {r.campaignName ?? ""}
            {r.level === "ad" ? ` › ${r.adSetName ?? ""}` : ""}
          </div>
        )}
      </td>
      {e.cols.map((c) => cell(r, c))}
    </tr>
  );
  let body: React.ReactNode[] = [];
  if (e.group === "none") body = rows.map(rowEl);
  else {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = groupKey(r);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const [k, list] of groups) {
      const st = subtotal(list);
      body.push(
        <tr key={`g:${k}`} className="grouphead">
          <td />
          <td>
            {k} <span className="small-note">· {list.length}</span>
          </td>
          {e.cols.map((c) => (
            <td key={c} className="r num">
              {c === "spend" ? f.money(st.spend) : c === "results" && st.results != null ? n0(st.results) : c === "kpi" && st.kpi != null && st.mode ? `${st.kpiShort} ${f.kpi(st.kpi, st.mode)}` : ""}
            </td>
          ))}
        </tr>,
        ...list.map(rowEl),
      );
    }
  }
  const tot = subtotal(rows);
  const csv = () => {
    const qq = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["Level", "Name", "Campaign", "Ad set", ...e.cols.map((c) => COLS[c].label)].map(qq).join(",");
    const lines = rows.map((r) =>
      [
        LEVEL[r.level],
        r.name,
        r.campaignName ?? "",
        r.adSetName ?? "",
        ...e.cols.map((c) => {
          const cc = COLS[c];
          const x = cc.csv ? cc.csv(r) : cc.get(r);
          return typeof x === "number" ? (Math.abs(x) < 1 ? x.toFixed(4) : x.toFixed(2)) : (x ?? "");
        }),
      ]
        .map(qq)
        .join(","),
    );
    return [head, ...lines].join("\n");
  };
  const exportCsv = async (how: "copy" | "download") => {
    const text = csv();
    if (how === "copy") {
      try {
        await navigator.clipboard.writeText(text);
        toast("Copied as CSV. Paste it into a spreadsheet.");
      } catch {
        toast("Your browser blocked copying here. Use Download CSV.");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `admate-${account.replace(/[^\w-]+/g, "-").toLowerCase()}-${e.level}-${v.from}-to-${v.to}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doSave = () => {
    const nm = (nameRef.current?.value ?? "").trim();
    if (!nm) {
      toast("Give the view a name first");
      return nameRef.current?.focus();
    }
    if (readOnly) return nudge("save Explorer views");
    start(async () => {
      const r = await saveView(nm, e);
      if (r.error) return toast(r.error);
      setSaved((s) => [...s.filter((x) => x.name !== nm), { id: r.id ?? nm, name: nm, config: e }]);
      setActive(`s:${nm}`);
      if (nameRef.current) nameRef.current.value = "";
      toast(`View “${nm}” saved to your account`);
    });
  };
  const bulk = async (kind: string) => {
    if (kind === "clear") return setSel(new Set());
    // An item missing from the page's details was left out because it is still open.
    const titles: Record<string, string> = {};
    const keys = selected
      .map((id) => {
        const r = rows.find((x) => x.id === id)!;
        const k = keyForEntity(v, r.level, r.id);
        const d = k ? detailOf(v, k) : null;
        if (k) titles[k] = d?.title ?? r.name;
        return k && (!d || isOpen(d)) ? k : null;
      })
      .filter((k): k is string => !!k);
    setSel(new Set());
    if (!keys.length) return toast("None of the selected rows had an open item");
    toast(`${plural(keys.length, "open item")} updated`);
    await decideMany(keys, kind, kind === "remind" ? 3 : kind === "dismissed" ? "Not relevant" : undefined, titles);
  };
  return (
    <section className="section">
      <SectionHead title="Explorer" hint="Build the table you need: level, columns, filters, grouping. Save it as a view." />
      <div className="excontrols">
        <div className="views">
          <span className="label">Quick views</span>
          {QUICK_VIEWS.map((qv, i) => (
            <button
              key={qv.name}
              className="v"
              type="button"
              aria-pressed={active === `q${i}`}
              onClick={() => {
                setE({ ...DEFAULT_EX, ...qv.state, cols: [...(qv.state.cols ?? DEFAULT_COLS)] });
                setActive(`q${i}`);
                setSel(new Set());
              }}
            >
              {qv.name}
            </button>
          ))}
          {saved.length > 0 && (
            <span className="label" style={{ marginLeft: 8 }}>
              Saved
            </span>
          )}
          {saved.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <button
                className="v"
                type="button"
                aria-pressed={active === `s:${s.name}`}
                onClick={() => {
                  setE(s.config);
                  setActive(`s:${s.name}`);
                  setSel(new Set());
                }}
              >
                {s.name}
              </button>
              <button
                className="link small"
                type="button"
                aria-label={`Delete view ${s.name}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteView(s.id);
                    setSaved((x) => x.filter((y) => y !== s));
                    setActive(null);
                  })
                }
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Level">
            {(
              [
                ["campaign", "Campaigns"],
                ["ad_group", "Ad sets"],
                ["ad", "Ads"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={e.level === k}
                onClick={() => {
                  set({ level: k, group: k === "campaign" && e.group === "campaign" ? "none" : e.group });
                  setSel(new Set());
                }}
              >
                {l} <span className="num">{v.levels[k].length}</span>
              </button>
            ))}
          </div>
          <label className="toggle">
            Group by{" "}
            <select className="sel" value={e.group} onChange={(ev) => set({ group: ev.target.value as ExState["group"] })}>
              <option value="none">Nothing</option>
              <option value="objective">Goal</option>
              <option value="platform">Platform</option>
              <option value="role">Funnel role</option>
              {e.level !== "campaign" && <option value="campaign">Campaign</option>}
            </select>
          </label>
          <span className="colpick">
            <button className="btn small" type="button" aria-expanded={colsOpen} onClick={() => setColsOpen((x) => !x)}>
              Columns ({e.cols.length}) ▾
            </button>
            {colsOpen && (
              <div className="pop" role="group" aria-label="Columns">
                {(Object.keys(COLS) as ExCol[]).map((k) => (
                  <label key={k}>
                    <input type="checkbox" checked={e.cols.includes(k)} onChange={(ev) => set({ cols: ev.target.checked ? [...e.cols, k] : e.cols.filter((x) => x !== k) })} /> {COLS[k].label}
                  </label>
                ))}
                <button className="link small" type="button" style={{ gridColumn: "1/-1" }} onClick={() => set({ cols: [...DEFAULT_COLS] })}>
                  Reset to default
                </button>
              </div>
            )}
          </span>
          <span className="grow" />
          <button className="btn small" type="button" onClick={() => exportCsv("copy")}>
            Copy CSV
          </button>
          <button className="btn small" type="button" onClick={() => exportCsv("download")}>
            Download CSV
          </button>
        </div>
        <div className="toolbar">
          <input className="inp" id="xQ" type="search" placeholder="Search names…" value={e.q} onChange={(ev) => set({ q: ev.target.value })} aria-label="Search" />
          <select className="sel" aria-label="Goal" value={e.obj} onChange={(ev) => set({ obj: ev.target.value })}>
            <option value="">All goals</option>
            {objs.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_DEFS[o as Objective].label}
              </option>
            ))}
          </select>
          <select className="sel" aria-label="Platform" value={e.plat} onChange={(ev) => set({ plat: ev.target.value })}>
            <option value="">All platforms</option>
            {plats.map((p) => (
              <option key={p} value={p}>
                {PLATFORM[p] ?? p}
              </option>
            ))}
          </select>
          <select className="sel" aria-label="Priority" value={e.prio} onChange={(ev) => set({ prio: ev.target.value as ExState["prio"] })}>
            <option value="all">All priorities</option>
            {(["high", "medium", "low"] as const).map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <label className="toggle">
            <input type="checkbox" checked={e.issues} onChange={(ev) => set({ issues: ev.target.checked })} /> Only items with a problem
          </label>
          <span className="grow" />
          <input className="inp" ref={nameRef} placeholder="Name this view" aria-label="View name" style={{ width: 150 }} onKeyDown={(ev) => ev.key === "Enter" && doSave()} />
          <button className="btn small" type="button" disabled={pending} onClick={doSave}>
            Save view
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="tablewrap" style={{ maxHeight: "70vh" }}>
          <table className="tbl dense" style={{ minWidth: 300 + e.cols.length * 96 }}>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all" checked={selected.length > 0 && selected.length === rows.length} onChange={(ev) => setSel(ev.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
                <th className="sortable" onClick={() => set({ sort: e.sort.key === "name" ? { key: "name", dir: e.sort.dir === 1 ? -1 : 1 } : { key: "name", dir: 1 } })}>
                  Name {e.sort.key === "name" ? (e.sort.dir > 0 ? "▲" : "▼") : ""}
                </th>
                {e.cols.map((c) => (
                  <th
                    key={c}
                    className={`sortable ${COLS[c].txt ? "" : "r"}`}
                    title={`Sort by ${COLS[c].label}`}
                    onClick={() => set({ sort: e.sort.key === c ? { key: c, dir: e.sort.dir === 1 ? -1 : 1 } : { key: c, dir: COLS[c].txt ? 1 : -1 } })}
                  >
                    <T s={COLS[c].label} /> {e.sort.key === c ? (e.sort.dir > 0 ? "▲" : "▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        </div>
      ) : (
        <Empty title="No rows" text="Nothing matches these filters. Clear the search or a filter." />
      )}
      <p className="small-note">
        {plural(rows.length, "row")} · spend {f.money(tot.spend)}
        {tot.results != null ? ` · ${n0(tot.results)} results` : ""}
        {tot.kpi != null && tot.mode ? ` · ${tot.kpiShort} ${f.kpi(tot.kpi, tot.mode)}` : ""}. Click a row to investigate; click a column to sort.
      </p>
      {v.levels.campaign.length > 0 && v.levels.ad_group.length === 0 && <p className="small-note">To see ad sets and ads, export your report at ad set or ad level (Meta: Ads Manager → Ad sets or Ads tab → Export).</p>}
      {selected.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <span>{plural(selected.length, "row")} selected: decide on their open items</span>
          <button className="btn small" type="button" onClick={() => bulk("done")}>
            Action taken
          </button>
          <button className="btn small" type="button" onClick={() => bulk("remind")}>
            Remind in 3 days
          </button>
          <button className="btn small" type="button" onClick={() => bulk("dismissed")}>
            Dismiss
          </button>
          <button className="btn small" type="button" onClick={() => bulk("clear")}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
