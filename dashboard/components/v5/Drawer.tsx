"use client";

import { useEffect, useRef, useState } from "react";
import { useV5 } from "./ctx";
import { usePage } from "./page";
import { ConfDots, DeltaChip, Dot, ImpactChip, KindTag, PathCrumbs, Plat, PrioChip, PrioText, Src, T } from "./bits";
import { DailyChart, DailyFacts, DriverBars, SimpleBars, type Series } from "./charts";
import {
  addDays, CONF_PLAIN, driverSentence, fmtDay, higher, kindOf, LEVEL, n0, n1, pct, plain, PRIO_PLAIN, prReasonOf, recheckOf, rowOf, statusText, stepsOf,
  type Item, type Level, type Row, type VM,
} from "./core";
import { LEVEL_INFO, type Level as View } from "@/lib/levels";
import { apiPath } from "@/lib/integration/paths";

// The item panel in three depths (prototype openDrawer): Beginner (plain words),
// Intermediate (investigate: what changed, what to do, why; evidence, where and day
// by day under "More detail") and Advanced (the same plus statistics, "how AdMate
// judged this" open).

export function useEntitySeries(ws: string, r: Pick<Row, "level" | "id" | "objective" | "mode"> | null, from: string, to: string) {
  const [got, setGot] = useState<{ key: string; s: Series | null } | null>(null);
  const key = r ? `${r.level}:${r.id}:${from}:${to}` : "";
  useEffect(() => {
    if (!r) return;
    let live = true;
    const q = new URLSearchParams({ ws, level: r.level, id: r.id, from, to, objective: r.objective, mode: r.mode });
    fetch(apiPath(`/api/v5/daily?${q}`))
      .then((x) => (x.ok ? x.json() : null))
      .then((s) => live && setGot({ key, s }))
      .catch(() => live && setGot({ key, s: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, key]);
  return got && got.key === key ? got.s : null;
}

export function Drawer({ d, depth, entity, onClose }: { d: Item; depth: View; entity: { level: Level; id: string } | null; onClose: () => void }) {
  const { ws, level, f } = useV5();
  const { vm, decide, open, ask, askAvailable } = usePage();
  const v = vm!;
  const ent = entity ?? d.entity;
  const r = rowOf(v, ent as { level: Level; id: string } | null);
  const series = useEntitySeries(ws, r, v.from, v.to);
  const [mode, setMode] = useState<"" | "dismiss" | "remind">("");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const env = { f, open, entity };
  const body = depth === "beginner" ? beginnerBody(env, d, series, v) : investigateBody(env, d, r, series, v, depth === "advanced");
  const act = (kind: string, extra?: string | number) => {
    decide(d.key, kind, extra);
    onClose();
  };
  const closed = d.status !== "todo" && d.status !== "in_review";
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t">
        <header>
          <button className="x" type="button" ref={closeRef} onClick={onClose}>
            Close ✕
          </button>
          {body.head}
          <div>
            {askAvailable && (
              <button className="btn small" type="button" onClick={() => ask(d.key)}>
                Ask the Assistant about this
              </button>
            )}{" "}
            {depth !== level && <span className="small-note">Showing the {LEVEL_INFO[depth].name} view of this item.</span>}
          </div>
        </header>
        <div className="scroll">{body.main}</div>
        <footer>
          {closed ? (
            <>
              <span className="note small-note">{statusText(d)}.</span>
              <button className="btn" type="button" onClick={() => act("restore")}>
                {d.status === "snoozed" ? "Cancel reminder" : "Undo"}
              </button>
            </>
          ) : depth === "beginner" ? (
            <>
              <span className="note small-note">AdMate never changes your ads. You make the change, then tell AdMate.</span>
              <button className="btn" type="button" onClick={() => act("remind", 1)}>
                Remind me tomorrow
              </button>
              <button className="btn" type="button" onClick={() => act("dismissed", "Not relevant")}>
                Not for me
              </button>
              <button className="btn primary" type="button" onClick={() => act("done")}>
                I did this
              </button>
            </>
          ) : mode === "dismiss" ? (
            <>
              <span className="note small-note">Why? It helps AdMate get better.</span>
              {["Not relevant", "Already handled", "Wrong"].map((x) => (
                <button key={x} className="btn small" type="button" onClick={() => act("dismissed", x)}>
                  {x}
                </button>
              ))}
              <button className="btn small" type="button" onClick={() => setMode("")}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {mode === "remind" && (
                <div className="menu" role="menu">
                  {(
                    [
                      [1, "Tomorrow"],
                      [3, "In 3 days"],
                      [7, "In a week"],
                    ] as const
                  ).map(([n, l]) => (
                    <button key={n} type="button" role="menuitem" onClick={() => act("remind", n)}>
                      {l}
                      <small>{fmtDay(addDays(today(), n))}</small>
                    </button>
                  ))}
                </div>
              )}
              <span className="note small-note">AdMate never changes your ad account.</span>
              <button className="btn" type="button" aria-expanded={mode === "remind"} onClick={() => setMode(mode === "remind" ? "" : "remind")}>
                Remind me later ▾
              </button>
              <button className="btn" type="button" onClick={() => setMode("dismiss")}>
                Dismiss
              </button>
              <button className="btn primary" type="button" onClick={() => act("done")}>
                Action taken
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );

}

type Env = { f: ReturnType<typeof useV5>["f"]; open: ReturnType<typeof usePage>["open"]; entity: { level: Level; id: string } | null };

function beginnerBody({ f, open, entity }: Env, d: Item, series: Series | null, v: VM) {
  const camp = String(d.where ?? "").split(" › ")[0];
  const tone = d.bucket === "problem" ? (d.priority === "high" ? "bad" : "warn") : d.bucket === "opportunity" ? "good" : "flat";
  const i = d.impact;
  const money1 =
    i && i.known && i.amount > 0 ? (
      i.label === "saved" ? (
        <>
          This saved you about <b>{f.money(i.amount)}</b> compared with what AdMate expected.
        </>
      ) : i.label === "extra revenue" ? (
        <>
          This brought about <b>{f.money(i.amount)}</b> more in sales than expected.
        </>
      ) : (
        <>
          This cost you about <b>{f.money(i.amount)}</b> {i.label === "lost revenue" ? "in lost sales" : "extra"} in {v.label}.
        </>
      )
    ) : null;
  const steps = stepsOf(d);
  const rc = recheckOf(d);
  const ev = (d.evidence ?? []).slice(0, 4);
  return {
    head: (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`tag ${tone}`}>{PRIO_PLAIN[d.priority] ?? ""}</span>
          <Plat p={d.platform} />
        </div>
        <h3 id="dr-t">{plain(d.title)}</h3>
        {camp && (
          <div className="crumbs">
            In <b>{camp}</b>
          </div>
        )}
      </>
    ),
    main: (
      <>
        <div className="blk">
          <h4>What’s happening</h4>
          <p>{plain(d.description)}</p>
        </div>
        {money1 && (
          <div className="blk">
            <h4>Why it matters</h4>
            <p>{money1}</p>
          </div>
        )}
        {steps.length > 0 && (
          <div className="blk">
            <h4>What to do</h4>
            <ol>
              {steps.map((s) => (
                <li key={s}>{plain(s)}</li>
              ))}
            </ol>
            {rc && <p className="small-note">{plain(rc)}</p>}
          </div>
        )}
        {series && (
          <div className="blk">
            <h4>How it’s going, day by day</h4>
            <SimpleBars series={series} from={v.from} to={v.to} />
          </div>
        )}
        <details className="more">
          <summary>More detail, still in plain words</summary>
          <div>
            {ev.length > 0 && (
              <div className="blk">
                <h4>The numbers behind this</h4>
                <ul>
                  {ev.map((e, k) => (
                    <li key={k}>
                      {plain(e.label)}: {e.a ? `${e.a} before → ` : ""}
                      <b>{e.b}</b>
                      {e.a ? " now" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.whyHappening?.[0] && (
              <div className="blk">
                <h4>Likely reason</h4>
                <span className="hyp">A best guess from the numbers, not a confirmed cause.</span>
                <p>{plain(d.whyHappening[0])}</p>
              </div>
            )}
            <div className="blk">
              <h4>How sure is AdMate?</h4>
              <p>{CONF_PLAIN[d.confidence] ?? ""}</p>
            </div>
            <p>
              <button className="link" type="button" onClick={() => open(d.key, { depth: "intermediate", entity })}>
                See the full analysis (Intermediate view) →
              </button>
            </p>
          </div>
        </details>
      </>
    ),
  };
}

function investigateBody(env: Env, d: Item, r: Row | null, series: Series | null, v: VM, adv: boolean) {
  const { f } = env;
  const steps = stepsOf(d);
  const rc = recheckOf(d);
  const cause = d.whyHappening?.[0];
  const rest = (d.whyHappening ?? []).slice(1);
  const drv = r?.drivers;
  const where = r ? <WhereTable r={r} v={v} env={env} /> : null;
  const hasWhere = !!r && whereRows(r, v).rows.length > 0;
  // Most useful first: what changed in one line, what to do, why. The evidence,
  // breakdown, daily chart, cost, statistics and how AdMate judged it fold away.
  return {
    head: (
      <>
        <div className="dmeta">
          <PrioText p={d.priority} />
          <Dot />
          <KindTag kind={kindOf(d)} />
          <Plat p={d.platform} />
          <Dot />
          <span className="conflabel" title="How sure AdMate is about the numbers">
            <ConfDots c={d.confidence} /> {d.confidence} confidence
          </span>
          <ImpactChip impact={d.impact} />
        </div>
        <h3 id="dr-t">{d.title}</h3>
        {d.where && (
          <div className="crumbs">
            <PathCrumbs where={d.where} />
          </div>
        )}
      </>
    ),
    main: (
      <>
        <div className="blk">
          <h4>
            What changed <Src k="data" />
          </h4>
          {r && r.kpi != null && (
            <div className="bigchange">
              <span className="v">{f.kpi(r.kpi, r.mode)}</span>
              <span className="muted">
                <T s={r.kpiShort} /> in {v.label}
              </span>
              {r.kpiA != null ? (
                <>
                  <span className="muted">
                    was {f.kpi(r.kpiA, r.mode)}
                    {v.compareLabel ? ` in ${v.compareLabel}` : ""}
                  </span>
                  <DeltaChip change={r.change} mode={r.mode} confidence={r.confidence} vs={v.compareLabel} />
                </>
              ) : (
                <span className="small-note">{v.compareLabel ? "No data in the comparison period." : "No comparison period selected."}</span>
              )}
            </div>
          )}
          <p>{d.description}</p>
        </div>
        {(steps.length > 0 || d.risk || rc) && (
          <div className="todo-card">
            <h4>
              What to do <Src k="step" />
            </h4>
            {steps.length > 0 && (
              <ol>
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {(d.risk || rc) && (
              <div className="after">
                {rc && <p className="small-note">{rc}</p>}
                {d.risk && (
                  <p className="small-note">
                    <b>Risk:</b> {d.risk}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {(drv?.length || cause) && (
          <div className="blk">
            <h4>
              Why <Src k="read" />
            </h4>
            {drv?.length ? (
              <>
                <DriverBars drivers={drv} />
                <p>{driverSentence(drv)}</p>
              </>
            ) : null}
            {cause && (
              <p>
                <span className="hyp">Likely cause (a hypothesis):</span> {cause}
              </p>
            )}
            {rest.length > 0 && (
              <details className="small">
                <summary>More context ({rest.length})</summary>
                <ul>
                  {rest.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <details className="more box">
          <summary>More detail: evidence, {hasWhere ? "where, " : ""}day by day{adv && r ? ", statistics" : ""}</summary>
          <div>
            {(d.evidence ?? []).length > 0 && (
              <div className="blk">
                <h4>
                  The numbers behind this <Src k="data" />
                </h4>
                <div className="evwrap">
                  <table className="ev">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>{v.compareLabel ?? "Before"}</th>
                        <th>{v.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.evidence.map((e, k) => (
                        <tr key={k}>
                          <td>
                            <T s={e.label} />
                          </td>
                          <td className="num">{e.a ?? "—"}</td>
                          <td className="num">{e.b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {hasWhere && (
              <div className="blk">
                <h4>
                  Where <Src k="data" />
                </h4>
                {where}
              </div>
            )}
            {series && (
              <div className="blk">
                <h4>
                  Day by day <Src k="data" />
                </h4>
                <DailyChart series={series} from={v.from} to={v.to} />
                <DailyFacts series={series} from={v.from} to={v.to} />
              </div>
            )}
            {d.cost && (
              <div className="blk">
                <h4>
                  What it cost <Src k="data" />
                </h4>
                <div className="costbox">
                  <p>{d.cost}</p>
                  <span className="small-note">Looking back only: money the change already cost, not a forecast.</span>
                </div>
              </div>
            )}
            {(d.cantTell ?? []).length > 0 && (
              <div className="warnbox">
                <b>What this report can’t tell us.</b> {d.cantTell.join(" ")}
              </div>
            )}
            {adv && r && <AdvStats r={r} v={v} f={f} />}
            <div className="rank">
              <div>
                <b>
                  Priority <PrioChip p={d.priority} />
                </b>
                <span>How much it matters now. {prReasonOf(d)}</span>
              </div>
              <div>
                <b>
                  Confidence <ConfDots c={d.confidence} /> {d.confidence}
                </b>
                <span>How sure AdMate is. {String(d.confidenceText ?? "").replace(/^\w+ — /, "")}</span>
              </div>
            </div>
            <details className="small" open={adv}>
              <summary>How AdMate judged this</summary>
              <ul>
                {(d.judgedBy ?? []).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          </div>
        </details>
      </>
    ),
  };
}

function WhereTable({ r, v, env: { f, open } }: { r: Row; v: VM; env: Env }) {
  const { rows, title, vsSiblings } = whereRows(r, v);
  if (!rows.length) return null;
  const vals = rows.map((x) => x.kpi).filter((k): k is number => k != null);
  const bestK = vals.length ? (higher(r.mode) ? Math.max(...vals) : Math.min(...vals)) : null;
  const worstK = vals.length ? (higher(r.mode) ? Math.min(...vals) : Math.max(...vals)) : null;
  const ads = r.level === "campaign" ? v.levels.ad.filter((x) => x.campaignId === r.id).sort((a, b) => b.spend - a.spend).slice(0, 6) : [];
  const tbl = (list: Row[], label: string) => (
    <div className="tablewrap">
      <table className="tbl dense">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="r">Spend</th>
            <th className="r">
              <T s={r.kpiShort} />
            </th>
            <th className="r">Change</th>
            <th className="r">
              <T s="CTR" />
            </th>
            <th>Next step</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.id} className={`click${x.id === r.id ? " sel" : ""}`} onClick={() => open(null, { entity: { level: x.level as Level, id: x.id } })}>
              <td>
                <div className="nm">{x.name}</div>
              </td>
              <td className="r num">{f.money(x.spend)}</td>
              <td className={`r num ${x.kpi != null && x.kpi === bestK && list.length > 1 ? "best" : x.kpi != null && x.kpi === worstK && list.length > 1 ? "worst" : ""}`}>{f.kpi(x.kpi, x.mode)}</td>
              <td className="r">
                <DeltaChip change={x.change} mode={x.mode} confidence={x.confidence} />
              </td>
              <td className="r num">{pct(x.ctr, 2)}</td>
              <td>{x.label ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <p className="small-note">
        {title}
        {vsSiblings ? ": ads in the same ad set share its audience and budget, so they’re a fair comparison." : "."} Green = best, red = weakest. Click a row to open it.
      </p>
      {tbl(rows, LEVEL[rows[0].level as Level])}
      {ads.length > 0 && (
        <>
          <p className="small-note">Its biggest ads:</p>
          {tbl(ads, "Ad")}
        </>
      )}
    </>
  );
}

function AdvStats({ r, v, f }: { r: Row; v: VM; f: Env["f"] }) {
  const cells: [string, string][] = [
    ["Spend", f.money(r.spend)], ["Share of spend", pct(r.share, 1)], ["Impressions", n0(r.impressions)], ["Reach", n0(r.reach)], ["Frequency", n1(r.frequency)], ["Clicks", n0(r.clicks)],
    ["CTR", pct(r.ctr, 2)], ["CPC", f.money(r.cpc)], ["CPM", f.money(r.cpm)], [r.resultLabel, n0(r.results)], ["Conversion rate", pct(r.cvr, 1)], [r.kpiShort, f.kpi(r.kpi, r.mode)],
  ];
  return (
    <div className="blk">
      <h4>
        Statistics <Src k="data" />
      </h4>
      <div className="facts">
        {cells.map(([k, val]) => (
          <div key={k}>
            {k}
            <b>{val}</b>
          </div>
        ))}
      </div>
      <p className="small-note">
        <b>Compared with:</b> {r.yardstick ?? "nothing yet"}
        {v.history ? ` · older history checked: ${v.history}` : ""}
        {v.perDay ? " · volumes per day (periods of different length)" : ""}.
      </p>
    </div>
  );
}


// The ad sets / ads behind an item, or an ad's siblings in its ad set.
function whereRows(r: Row, v: VM) {
  let rows: Row[] = [];
  let title = "";
  let vsSiblings = false;
  if (r.level === "campaign") {
    rows = v.levels.ad_group.filter((x) => x.campaignId === r.id);
    title = "Its ad sets";
  } else if (r.level === "ad_group") {
    rows = v.levels.ad.filter((x) => x.adSetId === r.id);
    title = "Its ads";
    vsSiblings = true;
  } else {
    rows = v.levels.ad.filter((x) => x.adSetId === r.adSetId);
    title = "This ad and the other ads in its ad set";
    vsSiblings = true;
  }
  if (rows.length < 2 && r.level !== "campaign") rows = [];
  return { rows, title, vsSiblings };
}

const today = () => new Date().toISOString().slice(0, 10);
