"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useV5 } from "../ctx";
import { usePage } from "../page";
import { ConfDots, DeltaChip, DriverChip as DriverChipInline, Empty, SectionHead, Src, T } from "../bits";
import { DailyChart, DriverBars, goalSeries, SimpleBars, Spark } from "../charts";
import { GoLink, ORow, TCard } from "../rows";
import {
  byGoalSpend, D0, decisions, driverSentence, fmtDay, firstSentence, higher, ICONCH, impactWord, isOpen, n0, OFF, openProblems, optimizeQueue, pct, plain, plural,
  presetName, signed, singular, STATE, TONE, WEEKDAYS, type Goal, type VM,
} from "../core";

// The home page of each view: Beginner Home ("Am I doing OK?"), Intermediate
// Overview (what changed and why) and the dense Advanced Overview.

// ---------- Advanced ----------
export function AdvOverview({ alerts }: { alerts: number }) {
  const { f, shown } = useV5();
  const { vm } = usePage();
  const v = vm!;
  const goals = byGoalSpend(v);
  const [trendObj, setTrend] = useState<string | null>(null);
  if (!goals.length) return <Empty title="No ad spend in this period" text="Pick another period above." />;
  const probs = openProblems(v, shown);
  const high = probs.filter((d) => d.priority === "high").length;
  const atStake = probs.reduce((s, d) => s + (d.impact?.known ? d.impact.amount : 0), 0);
  const opps = v.opportunities.filter((d) => isOpen(d) && shown(d)).length;
  const trend = goals.find((o) => o.objective === trendObj) ?? goals[0];
  const dcell = (o: Goal, key: string) => {
    const d = o.drivers?.find((x) => x.key === key);
    return d ? (
      <td className="r">
        <span className={`delta ${d.helped ? "good" : "bad"}`} title={`${Math.round(d.weight * 100)}% of the movement`}>
          {signed(d.change)}
        </span>
      </td>
    ) : (
      <td className="r muted">—</td>
    );
  };
  return (
    <>
      <div className="statusbar">
        <span className="stat">
          <span className="num">{f.money(v.spend)}</span> spend <DeltaChip change={v.spendChange} mode="neutral" />
        </span>
        <GoLink page="actions" className={`stat ${high ? "hi" : ""}`}>
          <span className="num">{probs.length}</span> problems ({high} high) · <span className="num">{f.money(atStake)}</span> at stake
        </GoLink>
        <GoLink page="actions" extra={{ f: "grow" }} className={`stat ${opps ? "good" : ""}`}>
          <span className="num">{opps}</span> opportunities
        </GoLink>
        <GoLink page="alerts" className={`stat ${alerts ? "hi" : ""}`}>
          <span className="num">{alerts}</span> {alerts === 1 ? "alert" : "alerts"}
        </GoLink>
      </div>
      <section className="section">
        <SectionHead title="Goals" hint={`${v.label}${v.compareLabel ? ` vs ${v.compareLabel}` : ""}${v.history ? ` · history ${v.history}` : ""}`} />
        <div className="tablewrap">
          <table className="tbl dense" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Goal</th>
                <th className="r">Main result</th>
                <th className="r">Δ</th>
                <th className="r">Target</th>
                <th className="r">Break-even</th>
                <th>Status</th>
                <th className="r">Results</th>
                <th className="r">Spend</th>
                <th className="r">Share</th>
                <th>Conf.</th>
                <th>4 weeks</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((o) => {
                const [c, w] = STATE[o.state] ?? STATE.unknown;
                return (
                  <tr key={o.objective} className={`click${o === trend ? " sel" : ""}`} tabIndex={0} onClick={() => setTrend(o.objective)} onKeyDown={(e) => e.key === "Enter" && setTrend(o.objective)}>
                    <td>
                      <b style={{ fontWeight: 500 }}>{o.label}</b>
                    </td>
                    <td className="r num">
                      {o.kpiShort} {f.kpi(o.value, o.mode)}
                    </td>
                    <td className="r">
                      <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} vs={v.compareLabel} />
                    </td>
                    <td className="r num">{o.target != null ? f.kpi(o.target, o.mode) : "—"}</td>
                    <td className="r num">{o.breakEven != null ? f.kpi(o.breakEven, o.mode) : "—"}</td>
                    <td>
                      <span className={`state ${c}`}>{w}</span>
                    </td>
                    <td className="r num">{n0(o.results)}</td>
                    <td className="r num">{f.money(o.spend)}</td>
                    <td className="r num">{pct(o.share, 1)}</td>
                    <td>
                      <ConfDots c={o.confidence} />
                    </td>
                    <td>
                      <Spark points={o.daily} target={o.target} w={90} h={24} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="chartbox">
          <span className="title">
            {trend.label}: {trend.resultLabel} per day and {trend.kpiShort} <span className="small-note">(click a goal row to switch)</span>
          </span>
          <DailyChart series={goalSeries(trend)} from={v.from} to={v.to} h={190} />
        </div>
      </section>
      <section className="section">
        <SectionHead
          title={
            <>
              Why goals moved <Src k="read" />
            </>
          }
          hint={v.compareLabel ? "Each driver’s change; green helped the result, red hurt it (hover for its share)" : ""}
        />
        {v.compareLabel ? (
          <div className="tablewrap">
            <table className="tbl dense" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Goal</th>
                  <th className="r">Δ main result</th>
                  <th className="r">CPM</th>
                  <th className="r">CTR</th>
                  <th className="r">Conv. rate</th>
                  <th className="r">Result rate</th>
                  <th className="r">Order value</th>
                  <th>Biggest mover</th>
                </tr>
              </thead>
              <tbody>
                {goals
                  .filter((o) => o.change != null)
                  .map((o) => {
                    const m = o.movers?.[0];
                    return (
                      <tr key={o.objective}>
                        <td>{o.label}</td>
                        <td className="r">
                          <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />
                        </td>
                        {dcell(o, "cpm")}
                        {dcell(o, "ctr")}
                        {dcell(o, "cvr")}
                        {dcell(o, "rate")}
                        {dcell(o, "aov")}
                        <td>{m ? <Mover m={m} /> : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No comparison period" text="Pick one in the date picker to split each change into its drivers." />
        )}
      </section>
      {v.dataNotes.length > 0 && (
        <section className="section">
          <SectionHead title="Data notes" hint="Things that affect how far these numbers can be trusted" />
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }} className="small">
            {v.dataNotes.map((n) => (
              <li key={n.key}>{n.text}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Mover({ m }: { m: NonNullable<Goal["movers"]>[number] }) {
  const { f } = useV5();
  const { open } = usePage();
  return (
    <>
      <button className="link" type="button" onClick={() => open(null, { entity: { level: "campaign", id: m.id } })}>
        {m.name}
      </button>{" "}
      <span className={`impact ${m.worse ? "bad" : "good"}`}>
        <b>{f.money(Math.abs(m.amount))}</b> <small>{impactWord(m.mode, m.worse)}</small>
      </span>
    </>
  );
}

// ---------- Intermediate ----------
function GoalTile({ o, sel, onPick }: { o: Goal; sel: boolean; onPick: () => void }) {
  const { f } = useV5();
  const [cls, word] = STATE[o.state] ?? STATE.unknown;
  return (
    <button className="tile" type="button" aria-pressed={sel} onClick={onPick}>
      <span className="k">
        {o.label} · <T s={o.kpiShort} />
      </span>
      <span className="v">{o.kpiMissing ? "—" : f.kpi(o.value, o.mode)}</span>
      <span className="row">
        <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />
        <Spark points={o.daily} target={o.target} />
      </span>
      <span className="t">
        <span className={`state ${cls}`}>{word}</span> {o.target != null ? `target ${f.kpi(o.target, o.mode)}` : "no target"}
      </span>
    </button>
  );
}
function ChangeCard({ o, v }: { o: Goal; v: VM }) {
  const { f } = useV5();
  const { open } = usePage();
  const worseNow = higher(o.mode) ? (o.change ?? 0) < 0 : (o.change ?? 0) > 0;
  return (
    <div className="card pad" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "baseline" }}>
        <b style={{ fontSize: 15 }}>{o.label}</b>
        <span className="num">
          <T s={o.kpiShort} /> {f.kpi(o.previous, o.mode)} → <b>{f.kpi(o.value, o.mode)}</b>
        </span>
        <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />
        <span className="small-note">
          {worseNow ? "worse" : "better"} than {v.compareLabel}
        </span>
      </div>
      <div className="two" style={{ gap: 18 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <span>
            <Src k="read" /> <b style={{ fontWeight: 500 }}>Why</b>
          </span>
          {o.drivers?.length ? (
            <>
              <DriverBars drivers={o.drivers} />
              <p className="small">{driverSentence(o.drivers)}</p>
            </>
          ) : (
            <p className="small-note">Not enough data to split this change into its causes.</p>
          )}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <span>
            <Src k="data" /> <b style={{ fontWeight: 500 }}>Where it came from</b>
          </span>
          {o.movers?.length ? (
            <>
              <div className="rows">
                {o.movers.map((m) => (
                  <button key={m.id} className="irow" type="button" style={{ paddingLeft: 14 }} onClick={() => open(null, { entity: { level: "campaign", id: m.id } })}>
                    <span className="body">
                      <span className="t">{m.name}</span>
                      <span className="sub">
                        <span className="num">
                          {f.kpi(m.kpiA, m.mode)} → {f.kpi(m.kpi, m.mode)}
                        </span>
                        <DriverChipInline drivers={m.drivers} />
                      </span>
                    </span>
                    <span className="side-r">
                      <span className={`impact ${m.worse ? "bad" : "good"}`}>
                        <b>{f.money(Math.abs(m.amount))}</b> <small>{impactWord(m.mode, m.worse)}</small>
                      </span>
                      <span className="link small">Investigate →</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="small-note">Money compared with each campaign’s own rate in {v.compareLabel}.</p>
            </>
          ) : (
            <p className="small-note">No single campaign stands out.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function IntOverview() {
  const { f, shown } = useV5();
  const { vm } = usePage();
  const v = vm!;
  const goals = byGoalSpend(v);
  const [trendObj, setTrend] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  if (!goals.length) return <Empty title="No ad spend in this period" text="Pick another period above, or upload a newer report." />;
  const off = goals.filter((o) => OFF.includes(o.state)).length;
  const probs = openProblems(v, shown);
  const opps = v.opportunities.filter((d) => isOpen(d) && shown(d));
  const atStake = probs.reduce((s, d) => s + (d.impact?.known ? d.impact.amount : 0), 0);
  const trend = goals.find((o) => o.objective === trendObj) ?? goals[0];
  const top = goals.slice(0, 4);
  const rest = goals.slice(4);
  const changed = goals
    .filter((o) => o.change != null && Math.abs(o.change) >= 0.05 && o.previous != null)
    .sort((a, b) => b.spend * Math.abs(b.change!) - a.spend * Math.abs(a.change!))
    .slice(0, 3);
  const queue = optimizeQueue(v, "open", "impact", shown);
  return (
    <>
      <div className="statusbar">
        <span className={`stat ${off ? "hi" : ""}`}>
          <span className="num">{off}</span> {off === 1 ? "goal" : "goals"} off track
        </span>
        <GoLink page="actions" extra={{ f: "fix" }} className={`stat ${probs.length ? "hi" : ""}`}>
          <span className="num">{probs.length}</span> problems · <span className="num">{f.money(atStake)}</span> at stake
        </GoLink>
        <GoLink page="actions" extra={{ f: "grow" }} className={`stat ${opps.length ? "good" : ""}`}>
          <span className="num">{opps.length}</span> opportunities
        </GoLink>
        <span className="stat">
          <span className="num">{f.money(v.spend)}</span> spend <DeltaChip change={v.spendChange} mode="neutral" />
        </span>
      </div>
      {v.oneLine && (
        <p className="oneline">
          <Src k="read" /> {v.oneLine}
        </p>
      )}
      <section className="section" aria-labelledby="kr-h">
        <SectionHead id="kr-h" title="Key results" hint={`Your biggest goals${v.compareLabel ? `, ▲▼ vs ${v.compareLabel}` : ""}. Click one to see its trend.`} />
        <div className="tiles">
          {top.map((o) => (
            <GoalTile key={o.objective} o={o} sel={o === trend} onPick={() => setTrend(o.objective)} />
          ))}
        </div>
        {rest.length > 0 && (
          <p>
            <button className="link" type="button" onClick={() => setMore((x) => !x)}>
              {more ? "Hide the smaller goals" : `Show ${plural(rest.length, "smaller goal")}`}
            </button>
          </p>
        )}
        {more && rest.length > 0 && (
          <div className="tiles">
            {rest.map((o) => (
              <GoalTile key={o.objective} o={o} sel={o === trend} onPick={() => setTrend(o.objective)} />
            ))}
          </div>
        )}
        <div className="chartbox">
          <span className="title">
            {trend.label}: {trend.resultLabel} per day and <T s={trend.kpiShort} />
          </span>
          <DailyChart series={goalSeries(trend)} from={v.from} to={v.to} h={180} />
        </div>
      </section>
      <section className="section" aria-labelledby="wc-h">
        <SectionHead id="wc-h" title="What changed and why" hint={v.compareLabel ? `The biggest moves vs ${v.compareLabel}, split into their causes` : ""} />
        {!v.compareLabel ? (
          <Empty title="Pick a comparison period" text="Choose “The period right before” or another period in the date picker to see what changed and why." />
        ) : changed.length ? (
          changed.map((o) => <ChangeCard key={o.objective} o={o} v={v} />)
        ) : (
          <Empty title="No big changes" text={`Every goal is within 5% of ${v.compareLabel}.`} />
        )}
      </section>
      <section className="section" aria-labelledby="to-h">
        <SectionHead
          id="to-h"
          title="Top optimizations"
          hint="Ranked by money at stake"
          more={
            <GoLink page="actions" className="link">
              All {queue.length} in Optimize →
            </GoLink>
          }
        />
        {queue.length ? (
          <div className="rows">
            {queue.slice(0, 3).map((d, i) => (
              <ORow key={d.key} d={d} i={i} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing to optimize right now" text="Every campaign is in line with what AdMate expected." />
        )}
      </section>
    </>
  );
}

// ---------- Beginner ----------
const periodWord = (v: VM) => (v.days === 7 ? "week" : v.days === 1 ? "day" : `${v.days} days`);
function plainGoal(o: Goal, before: string, k: (x: number | null) => string) {
  if (o.value == null) return { tone: "flat" as const, text: <><b>{o.label}:</b> not enough results yet to judge.</> };
  const value =
    o.mode === "roas" ? (
      <>
        you got <b>${o.value.toFixed(2)} back in sales for every $1</b> you spent
      </>
    ) : o.mode === "cpm" ? (
      <>
        showing your ads 1,000 times cost <b>{k(o.value)}</b>
      </>
    ) : (
      <>
        each {singular(o)} cost you <b>{k(o.value)}</b>
      </>
    );
  const below = o.breakEven != null && (higher(o.mode) ? o.value < o.breakEven : o.value > o.breakEven);
  const judge: Record<string, React.ReactNode> = {
    far_off: below ? (
      <>
        Your goal is {o.target != null ? k(o.target) : "better"}, so <b>you’re losing money</b> on these ads.
      </>
    ) : (
      `That’s far from your goal of ${k(o.target)}.`
    ),
    off_track: `That’s a little worse than your goal of ${k(o.target)}.`,
    on_track: (
      <>
        Your goal is {k(o.target)}, so <b>you’re on track</b>.
      </>
    ),
    better: `That’s better than ${before} (${k(o.previous)}).`,
    worse: `That’s worse than ${before} (${k(o.previous)}).`,
    flat: `About the same as ${before}.`,
    unknown: "",
  };
  return {
    tone: TONE[o.state] ?? "flat",
    text: (
      <>
        <b>{o.label}:</b> {value}. {judge[o.state] ?? ""}
      </>
    ),
  };
}

export function BegHome() {
  const { f, shown, end, min } = useV5();
  const { vm, open } = usePage();
  const search = useSearchParams();
  const v = vm!;
  const picked = search.get("cmp") === "custom";
  const periodName = end && min ? presetName({ from: v.from, to: v.to }, end, min) : null;
  const [moreGoals, setMoreGoals] = useState(false);
  const goals = byGoalSpend(v);
  if (!goals.length) return <Empty title="No ad spend in this period" text="Pick another period above, or upload a newer report." />;
  const k = (x: number | null) => (x == null ? "—" : f.kpi(x, "cost"));
  const before = picked && v.compareLabel ? v.compareLabel : `the ${periodWord(v)} before`;
  const words = !periodName ? `in ${v.label}` : /^(Last|This|The)\b/.test(periodName) ? `in ${periodName.replace(/^Last/, "the last").replace(/^This/, "this").replace(/^The/, "the")}` : `in ${periodName}`;
  const kOf = (o: Goal) => (x: number | null) => (x == null ? "—" : o.mode === "roas" ? `$${x.toFixed(2)} back` : k(x));
  const lines = goals.slice(0, 3).map((o) => plainGoal(o, before, kOf(o)));
  const todo = decisions(v, shown);
  const probsHM = openProblems(v, shown).filter((d) => d.priority === "high" || d.priority === "medium");
  const bad = lines.some((l) => l.tone === "bad") || probsHM.some((d) => d.priority === "high");
  const warn = bad || lines.some((l) => l.tone === "warn") || probsHM.length > 0;
  const tone = bad ? "bad" : warn ? "warn" : "good";
  const headline = tone === "bad" ? `Your ads need attention${probsHM.length ? `: ${plural(probsHM.length, "problem")} to fix` : ""}` : tone === "warn" ? "Mostly OK, with a few things to improve" : "Your ads are doing well";
  const ch = v.spendChange;
  const top = todo.filter((d) => d.bucket === "problem")[0] ?? null;
  const next = top ?? todo[0] ?? null;
  const great = v.great.filter((g) => {
    const d = v.details[g.key] ?? [...v.opportunities].find((x) => x.key === g.key);
    return !d || isOpen(d);
  })[0];
  const others = goals.slice(3);
  const chartGoal = goals.find((o) => o.mode !== "cpm" && o.results > 0);
  const series = chartGoal ? { resultLabel: chartGoal.resultLabel, days: chartGoal.daily.map((d) => ({ date: d.date, results: d.results })) } : null;
  let takeaway: React.ReactNode = null;
  if (series && chartGoal) {
    const inP = series.days.filter((d) => d.date >= v.from && d.date <= v.to);
    const best = inP.length ? inP.reduce((b, d) => (d.results > b.results ? d : b)) : null;
    const wd = Array.from({ length: 7 }, () => ({ r: 0, n: 0 }));
    for (const d of series.days) {
      wd[D0(d.date).getUTCDay()].r += d.results;
      wd[D0(d.date).getUTCDay()].n++;
    }
    const bestWd = wd.map((x, i) => ({ i, avg: x.n ? x.r / x.n : 0 })).sort((p, q) => q.avg - p.avg)[0];
    takeaway = (
      <>
        {best && best.results > 0 && (
          <>
            Your best day was <b>{fmtDay(best.date)}</b> with {n0(best.results)} {chartGoal.resultLabel}.{" "}
          </>
        )}
        Over the last 4 weeks, <b>{WEEKDAYS[bestWd.i]}</b> was usually your best day.
      </>
    );
  }
  return (
    <>
      <section className={`hero ${tone}`} aria-labelledby="ok-h">
        <span className="label">Am I doing OK?</span>
        <h2 id="ok-h">{headline}</h2>
        <p className="say">
          You spent <b>{f.money(v.spend)}</b> {words}
          {ch == null || !v.compareLabel ? "" : Math.abs(ch) < 0.03 ? `, about the same as ${before}` : `, ${pct(Math.abs(ch))} ${ch > 0 ? "more" : "less"} than ${before}`}.
        </p>
        <ul className="plaingoals">
          {[...lines, ...(moreGoals ? others.map((o) => plainGoal(o, before, kOf(o))) : [])].map((g, i) => (
            <li key={i}>
              <span className={`ico ${g.tone}`} aria-hidden="true">
                {ICONCH[g.tone]}
              </span>
              <span>{g.text}</span>
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <p>
            <button className="link" type="button" onClick={() => setMoreGoals((x) => !x)}>
              {moreGoals ? "Show only my main goals" : `Show my ${plural(others.length, "smaller goal")}`}
            </button>
          </p>
        )}
      </section>
      <section className="section" aria-labelledby="bp-h">
        <SectionHead id="bp-h" title={top ? "Fix this first" : "Your next step"} hint={top ? "The most urgent problem, and how to fix it step by step" : "No problems found. Here’s the best thing to do next."} />
        {next ? <TCard d={next} i={0} big /> : <Empty title="Nothing needs doing right now" text="AdMate checks again after your next upload." />}
        {todo.length > 1 && (
          <p>
            <GoLink page="actions" className="link">
              {plural(todo.length - 1, "more thing")} to do →
            </GoLink>
          </p>
        )}
      </section>
      {great && (
        <section className="section" aria-labelledby="gw-h">
          <SectionHead id="gw-h" title="What’s working" />
          <div className="gcard">
            <span className="tag good">Doing great</span>
            <span className="t">{great.campaign}</span>
            <p>{plain(firstSentence(great.why))}</p>
            <p className="do">
              <b style={{ fontWeight: 500 }}>You could:</b> {plain(firstSentence(great.action))}
            </p>
            <div>
              <button className="btn small" type="button" onClick={() => open(great.key)}>
                Explain more
              </button>
            </div>
          </div>
        </section>
      )}
      {series && chartGoal && (
        <section className="section" aria-labelledby="ch-h">
          <SectionHead id="ch-h" title={`Your ${chartGoal.resultLabel} per day`} hint={`${chartGoal.label}, last 4 weeks`} />
          <div className="chartbox">
            <SimpleBars series={series} from={v.from} to={v.to} />
            <p className="cap">{takeaway}</p>
          </div>
        </section>
      )}
      <details className="more">
        <summary>Words you’ll see in AdMate</summary>
        <div className="words">
          <div>
            <b>Cost per result</b>What one result (a message, a lead, a sale) cost you in ads, on average. Lower is better.
          </div>
          <div>
            <b>Sales per $1 spent (ROAS)</b>How much you sold for each $1 of ads. Higher is better.
          </div>
          <div>
            <b>Click rate (CTR)</b>Out of everyone who saw your ad, the share who clicked it.
          </div>
          <div>
            <b>Goal</b>The cost (or return) you’re aiming for. Set it in Goals &amp; settings.
          </div>
        </div>
      </details>
    </>
  );
}
