"use client";

import { useState, useTransition } from "react";
import { setCampaignObjective, setCampaignRole } from "@/app/actions";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { DeltaChip, Empty, ImpactChip, KindTag, Plat, PrioChip, SectionHead, Src, T } from "../bits";
import { OverlayChart } from "../charts";
import { useEntitySeries } from "../Drawer";
import { higher, LEVEL, n0, n1, pct, plain, plural, PLATFORM, PRIO_RANK, ROLE, signed, singular, type Level, type Row } from "../core";
import { OBJECTIVE_DEFS, OBJECTIVES, type Objective } from "@/lib/metrics/objectives";
import type { Role } from "@/lib/analysis/roles";

// Campaigns: Beginner "My ads" (cards), and the campaign › ad set › ad table with
// Compare for Intermediate and Advanced (Advanced adds CPM, frequency and money at stake).

const CAMP_TAG: Record<string, [string, string]> = {
  issue: ["bad", "Needs attention"],
  opportunity: ["good", "Doing great"],
  on_track: ["good", "On track"],
  learning: ["flat", "Too early to tell"],
  waiting: ["flat", "Too early to tell"],
  signal: ["flat", "Keep an eye on it"],
};
const campGroup = (r: Row) => (r.kind === "issue" ? "attention" : r.kind === "opportunity" || r.kind === "on_track" ? "well" : "early");

export function BegMyAds() {
  const { f } = useV5();
  const { vm, open } = usePage();
  const v = vm!;
  const [filter, setFilter] = useState("all");
  const rows = [...v.levels.campaign].sort((a, b) => (PRIO_RANK[a.priority ?? ""] ?? 9) - (PRIO_RANK[b.priority ?? ""] ?? 9) || b.spend - a.spend);
  if (!rows.length) return <Empty title="No campaign spent money in this period" text="Pick another period above." />;
  const count = (g: string) => rows.filter((r) => campGroup(r) === g).length;
  const list = filter === "all" ? rows : rows.filter((r) => campGroup(r) === filter);
  return (
    <section className="section">
      <SectionHead title="My ads" hint={`${v.label} · tap a campaign to see what to do`} />
      <div className="filters" role="group" aria-label="Show">
        {(
          [
            ["all", `All (${rows.length})`],
            ["attention", `Needs attention (${count("attention")})`],
            ["well", `Doing well (${count("well")})`],
            ["early", `Too early to tell (${count("early")})`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={k === filter} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="grid3">
          {list.map((r) => {
            const [tone, word] = CAMP_TAG[r.kind ?? ""] ?? ["flat", "No verdict yet"];
            const each = r.kpi == null ? "no results yet" : r.mode === "roas" ? `$${r.kpi.toFixed(2)} back in sales for every $1` : r.mode === "cpm" ? `${f.money(r.kpi)} per 1,000 views` : `${f.money(r.kpi)} per ${singular(r)}`;
            const exp = r.expected != null ? `AdMate expected about ${r.mode === "roas" ? `$${r.expected.toFixed(2)} back` : f.money(r.expected)}.` : "";
            return (
              <button key={r.id} className="ccard" type="button" onClick={() => open(null, { entity: { level: "campaign", id: r.id } })}>
                <span className={`tag ${tone}`}>{word}</span>
                <span className="t">{r.name}</span>
                <p>
                  {r.mode === "cpm" ? "" : `${n0(r.results)} ${r.resultLabel} · `}
                  {each}
                </p>
                {exp && <p className="small-note">{exp}</p>}
                <p className="small-note">
                  Spent {f.money(r.spend)} · {pct(r.share)} of your ad budget · {PLATFORM[r.platform] ?? r.platform}
                </p>
                {r.label && (
                  <p>
                    <b style={{ fontWeight: 500 }}>Next:</b> {plain(r.label)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty title="Nothing here" text="No campaign in this group for this period." />
      )}
    </section>
  );
}

export function Campaigns() {
  const { f, ws, isAdv: adv, readOnly, nudge } = useV5();
  const { vm, open, toast } = usePage();
  const v = vm!;
  const [lvl, setLvl] = useState<Level>("campaign");
  const [objFilter, setObjFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [, start] = useTransition();
  if (!v.levels.campaign.length) return <Empty title="No campaign spent money in this period" text="Pick another period above." />;
  const camps = v.levels.campaign.filter((r) => !objFilter || r.objective === objFilter);
  const objs = [...new Set(v.levels.campaign.map((r) => r.objective))];
  const n = compare.length;
  const toggleExp = (id: string) =>
    setExpanded((s) => {
      const x = new Set(s);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });
  const cmpToggle = (ck: string, on: boolean) => {
    if (on && compare.length >= 3) return toast("Compare up to 3 at a time");
    setCompare((c) => (on ? [...c, ck] : c.filter((x) => x !== ck)));
  };
  const openRow = (r: Row) => open(null, { entity: { level: r.level as Level, id: r.id } });
  const cells = (r: Row, depth: number, tw?: React.ReactNode) => {
    const ck = `${r.level}:${r.id}`;
    const crumb =
      r.level === "ad_group" ? (
        <span>
          in <b>{r.campaignName}</b>
        </span>
      ) : r.level === "ad" ? (
        <span>
          in <b>{r.campaignName}</b> › <b>{r.adSetName}</b>
        </span>
      ) : null;
    return (
      <>
        <td>
          <input type="checkbox" aria-label={`Compare ${r.name}`} checked={compare.includes(ck)} disabled={!compare.includes(ck) && n >= 3} onChange={(e) => cmpToggle(ck, e.target.checked)} />
        </td>
        <td>
          <PrioChip p={r.priority} /> <KindTag kind={r.kind} />
        </td>
        <td>
          <div className="nm">
            {tw}
            <span className="lvl">{LEVEL[r.level as Level]}</span>
            <span>{r.name}</span>
          </div>
          <div className="sub">
            <Plat p={r.platform} />
            {depth ? <span>{r.objectiveLabel}</span> : null}
            {crumb}
            {depth === 0 && (
              <>
                <select
                  aria-label="Objective"
                  value={r.objective}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const o = e.target.value as Objective;
                    if (readOnly) return nudge("set campaign goals");
                    start(async () => {
                      await setCampaignObjective(ws, r.id, o);
                      toast(`Goal set to ${OBJECTIVE_DEFS[o].label}. AdMate re-judges it with that goal’s result.`);
                    });
                  }}
                >
                  {OBJECTIVES.map((o) => (
                    <option key={o} value={o}>
                      {OBJECTIVE_DEFS[o].label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Funnel role"
                  value={r.role}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const role = e.target.value as Role;
                    if (readOnly) return nudge("set funnel roles");
                    start(async () => {
                      await setCampaignRole(ws, r.id, role);
                      toast(`Funnel role set to ${ROLE[role]}. AdMate now compares it only with ${ROLE[role].toLowerCase()} campaigns.`);
                    });
                  }}
                >
                  {Object.entries(ROLE).map(([k, nm]) => (
                    <option key={k} value={k}>
                      {nm}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </td>
        <td className="r">
          <div className="num">{f.money(r.spend)}</div>
          <div className="was num">{pct(r.share)} of all</div>
        </td>
        <td className="r">
          <div className="num">
            <T s={r.kpiShort} /> {f.kpi(r.kpi, r.mode)}
          </div>
          <DeltaChip change={r.change} mode={r.mode} confidence={r.confidence} />
          {r.kpiA != null && <div className="was num">was {f.kpi(r.kpiA, r.mode)}</div>}
        </td>
        <td className="r">
          <div className="num">{r.mode === "cpm" ? "—" : n0(r.results)}</div>
          <div className="was">{r.mode === "cpm" ? "judged by CPM" : r.resultLabel}</div>
        </td>
        <td className="r num">{pct(r.ctr, 2)}</td>
        {adv && (
          <>
            <td className="r num">{f.money(r.cpm)}</td>
            <td className="r num">{n1(r.frequency)}</td>
            <td className="r">{r.impact ? <ImpactChip impact={r.impact} /> : <span className="muted">—</span>}</td>
          </>
        )}
        <td>{r.label ?? ""}</td>
      </>
    );
  };
  const rowProps = (r: Row, cls: string) => ({
    className: `click${cls}`,
    tabIndex: 0,
    onClick: (e: React.MouseEvent) => !(e.target as HTMLElement).closest("input, select, button") && openRow(r),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && (e.target as HTMLElement).tagName === "TR" && openRow(r),
  });
  const body: React.ReactNode[] = [];
  if (lvl === "campaign") {
    for (const c of camps) {
      const sets = v.levels.ad_group.filter((s) => s.campaignId === c.id);
      const isOpenC = expanded.has(c.id);
      body.push(
        <tr key={c.id} {...rowProps(c, "")}>
          {cells(
            c,
            0,
            sets.length ? (
              <button className="tw" type="button" aria-expanded={isOpenC} aria-label={`${isOpenC ? "Hide" : "Show"} ad sets`} onClick={() => toggleExp(c.id)}>
                {isOpenC ? "▾" : "▸"}
              </button>
            ) : null,
          )}
        </tr>,
      );
      if (!isOpenC) continue;
      for (const s of sets) {
        const ads = v.levels.ad.filter((a) => a.adSetId === s.id);
        const sOpen = expanded.has(s.id);
        body.push(
          <tr key={s.id} {...rowProps(s, " lv1")}>
            {cells(
              s,
              1,
              ads.length ? (
                <button className="tw" type="button" aria-expanded={sOpen} aria-label={`${sOpen ? "Hide" : "Show"} ads`} onClick={() => toggleExp(s.id)}>
                  {sOpen ? "▾" : "▸"}
                </button>
              ) : null,
            )}
          </tr>,
        );
        if (sOpen)
          for (const a of ads)
            body.push(
              <tr key={a.id} {...rowProps(a, " lv2")}>
                {cells(a, 2)}
              </tr>,
            );
      }
    }
  } else {
    for (const c of camps) {
      const items = v.levels[lvl].filter((x) => x.campaignId === c.id);
      if (!items.length) continue;
      body.push(
        <tr key={`g${c.id}`} className="grouphead">
          <td colSpan={adv ? 11 : 8}>
            <span className="lvl">Campaign</span> {c.name}{" "}
            <span className="small-note">
              · {c.objectiveLabel} · {PLATFORM[c.platform] ?? c.platform}
            </span>
          </td>
        </tr>,
      );
      for (const x of items)
        body.push(
          <tr key={x.id} {...rowProps(x, lvl === "ad_group" ? " lv1" : " lv2")}>
            {cells(x, lvl === "ad_group" ? 1 : 2)}
          </tr>,
        );
    }
  }
  return (
    <section className="section">
      <SectionHead title="Campaigns" hint={`${v.label} · ▸ shows a campaign’s ad sets and ads · tick 2 or 3 rows to compare them${adv ? " · Explorer has custom columns and saved views" : ""}`} />
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Level">
          {(
            [
              ["campaign", "Campaign › ad set › ad"],
              ["ad_group", "All ad sets"],
              ["ad", "All ads"],
            ] as const
          ).map(([k, nm]) => (
            <button key={k} type="button" aria-pressed={k === lvl} onClick={() => setLvl(k)}>
              {nm} <span className="num">{v.levels[k].length}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        {lvl === "campaign" && (
          <button
            className="btn small"
            type="button"
            onClick={() => {
              const all = camps.every((c) => expanded.has(c.id));
              setExpanded(all ? new Set() : new Set(camps.map((c) => c.id)));
            }}
          >
            {camps.every((c) => expanded.has(c.id)) ? "Collapse all" : "Expand all"}
          </button>
        )}
        <button className={`btn ${n >= 2 ? "primary" : ""}`} type="button" disabled={n < 2} onClick={() => setShowCompare(true)}>
          Compare {n ? `(${n})` : ""}
        </button>
        {n > 0 && (
          <button className="link" type="button" onClick={() => setCompare([])}>
            Clear
          </button>
        )}
      </div>
      <div className="filters" role="group" aria-label="Goal">
        <button type="button" aria-pressed={!objFilter} onClick={() => setObjFilter(null)}>
          All goals
        </button>
        {objs.map((o) => (
          <button key={o} type="button" aria-pressed={objFilter === o} onClick={() => setObjFilter(o)}>
            {OBJECTIVE_DEFS[o].label}
          </button>
        ))}
      </div>
      <div className="tablewrap">
        <table className={`tbl${adv ? " dense" : ""}`} style={{ minWidth: adv ? 1180 : 920 }}>
          <thead>
            <tr>
              <th>
                <span className="sr">Compare</span>
              </th>
              <th>Priority · state</th>
              <th>Name</th>
              <th className="r">Spend</th>
              <th className="r">Main result {v.compareLabel ? `(▲▼ vs ${v.compareLabel})` : ""}</th>
              <th className="r">Results</th>
              <th className="r">
                <T s="CTR" />
              </th>
              {adv && (
                <>
                  <th className="r">CPM</th>
                  <th className="r">Freq.</th>
                  <th className="r">Money at stake</th>
                </>
              )}
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      {showCompare && <CompareModal keys={compare} onClose={() => setShowCompare(false)} />}
    </section>
  );
}

// Why one item beats another, from the same metric tree the engine uses:
// cost per result = CPM ÷ (1000 × CTR × conversion rate); ROAS adds order value.
function keyDifference(a: Row, b: Row, money: (v: number) => string) {
  const better = (higher(a.mode) ? (a.kpi ?? 0) >= (b.kpi ?? 0) : (a.kpi ?? Infinity) <= (b.kpi ?? Infinity)) ? a : b;
  const worse = better === a ? b : a;
  if (better.kpi == null || worse.kpi == null || better.kpi === worse.kpi) return "";
  const terms: { label: string; val: number; vb: number; vw: number; fmt: (x: number) => string }[] = [];
  const add = (label: string, vb: number | null, vw: number | null, sign: number, fmt: (x: number) => string) => {
    if (vb != null && vw != null && vb > 0 && vw > 0) terms.push({ label, val: sign * Math.log(vb / vw), vb, vw, fmt });
  };
  add("showing the ads costs less", better.cpm, worse.cpm, -1, money);
  if (better.cvr != null && worse.cvr != null) {
    add("more of the people who see it click", better.ctr, worse.ctr, 1, (x) => pct(x, 2));
    add("more of the people who click go on to act", better.cvr, worse.cvr, 1, (x) => pct(x, 1));
  } else add("more of the people who see it act", better.impressions ? better.results / better.impressions : null, worse.impressions ? worse.results / worse.impressions : null, 1, (x) => pct(x, 2));
  if (better.mode === "roas" && better.results > 0 && worse.results > 0) add("each order is worth more", better.revenue / better.results, worse.revenue / worse.results, 1, money);
  const m = terms.sort((x, y) => y.val - x.val)[0];
  if (!m || m.val <= 0) return "";
  const gap = higher(better.mode) ? better.kpi / worse.kpi - 1 : 1 - better.kpi / worse.kpi;
  return `“${better.name}” does ${Math.round(gap * 100)}% better than “${worse.name}” on ${better.kpiShort}, mainly because ${m.label} (${m.fmt(m.vb)} vs ${m.fmt(m.vw)}).`;
}

function CompareModal({ keys, onClose }: { keys: string[]; onClose: () => void }) {
  const { f, ws } = useV5();
  const { vm } = usePage();
  const v = vm!;
  const items = keys.map((k) => {
    const [lv, id] = k.split(":") as [Level, string];
    return v.levels[lv]?.find((r) => r.id === id);
  }).filter((x): x is Row => !!x);
  const s0 = useEntitySeries(ws, items[0] ?? null, v.from, v.to);
  const s1 = useEntitySeries(ws, items[1] ?? null, v.from, v.to);
  const s2 = useEntitySeries(ws, items[2] ?? null, v.from, v.to);
  if (items.length < 2) return null;
  const same = items.every((r) => r.objective === items[0].objective && r.mode === items[0].mode);
  const best = (vals: (number | null)[], hi: boolean) => {
    const xs = vals.filter((x): x is number => x != null);
    return xs.length ? (hi ? Math.max(...xs) : Math.min(...xs)) : null;
  };
  const th: React.CSSProperties = { position: "static", textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-display)", fontSize: 13 };
  const metric = (label: React.ReactNode, get: (r: Row) => number | string | null, fmt: (x: never) => React.ReactNode, hi: boolean | null) => {
    const vals = items.map(get);
    const nums = vals as (number | null)[];
    const b = hi == null ? null : best(nums, hi);
    const w = hi == null ? null : best(nums, !hi);
    return (
      <tr>
        <th scope="row" style={th}>
          {label}
        </th>
        {vals.map((x, i) => (
          <td key={i} className={`r num ${hi != null && x != null && nums.filter((y) => y != null).length > 1 && x === b ? "best" : hi != null && x != null && x === w && b !== w ? "worst" : ""}`}>
            {fmt(x as never)}
          </td>
        ))}
      </tr>
    );
  };
  const ranked = items.filter((r) => r.kpi != null).sort((a, b) => (higher(a.mode) ? b.kpi! - a.kpi! : a.kpi! - b.kpi!));
  const diff = same && ranked.length >= 2 ? keyDifference(ranked[0], ranked[ranked.length - 1], f.money) : "";
  const roles = new Set(items.map((r) => r.role));
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cm-t" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <article className="mbox">
          <header>
            <div>
              <span className="label">Compare · {v.label}</span>
              <h2 id="cm-t">
                {plural(items.length, LEVEL[items[0].level as Level].toLowerCase())} side by side
              </h2>
            </div>
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
          </header>
          <div className="mbody">
            {!same && <p className="warnbox">These have different goals, so their main results can’t be compared directly. Compare spend, clicks and costs instead.</p>}
            {diff && (
              <p>
                <Src k="read" /> {diff}
              </p>
            )}
            {same && roles.size > 1 && (
              <p className="small-note">
                Note: these have different funnel roles ({[...roles].map((x) => ROLE[x]).join(" vs ")}). Retargeting and existing-customer audiences usually cost less, so AdMate never judges one against the other.
              </p>
            )}
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>
                      <Src k="data" />
                    </th>
                    {items.map((r) => (
                      <th key={r.id} style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-display)", fontSize: 12.5, color: "var(--fg)", whiteSpace: "normal" }}>
                        {r.name}
                        <div className="small-note">
                          {LEVEL[r.level as Level]} · {PLATFORM[r.platform] ?? r.platform}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metric("Goal", (r) => r.objectiveLabel, (x: string) => x, null)}
                  {metric("Spend", (r) => r.spend, (x: number) => f.money(x), null)}
                  {same ? (
                    metric(<T s={items[0].kpiShort} />, (r) => r.kpi, (x: number | null) => f.kpi(x, items[0].mode), higher(items[0].mode))
                  ) : (
                    <tr>
                      <th scope="row" style={th}>
                        Main result
                      </th>
                      {items.map((r) => (
                        <td key={r.id} className="r num">
                          {r.kpiShort} {f.kpi(r.kpi, r.mode)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {metric(`Change vs ${v.compareLabel ?? "before"}`, (r) => r.change, (x: number | null) => (x == null ? "—" : signed(x)), null)}
                  {metric("Results", (r) => (r.mode === "cpm" ? null : r.results), (x: number | null) => n0(x), true)}
                  {metric(<T s="CTR" />, (r) => r.ctr, (x: number | null) => pct(x, 2), true)}
                  {metric(<T s="CPC" />, (r) => r.cpc, (x: number | null) => f.money(x), false)}
                  {metric(<T s="CPM" />, (r) => r.cpm, (x: number | null) => f.money(x), false)}
                  {metric(<T s="Conversion rate" />, (r) => r.cvr, (x: number | null) => pct(x, 1), true)}
                  {metric(<T s="Frequency" />, (r) => r.frequency, (x: number | null) => n1(x), null)}
                  {metric("AdMate’s next step", (r) => r.label, (x: string | null) => x ?? "—", null)}
                </tbody>
              </table>
            </div>
            <p className="small-note">Green = best of the compared rows, red = weakest (only where higher or lower is clearly better).</p>
            {same && (
              <OverlayChart
                list={items.map((r, i) => ({ name: r.name, series: [s0, s1, s2][i] }))}
                from={v.from}
                to={v.to}
              />
            )}
          </div>
        </article>
      </div>
    </>
  );
}
