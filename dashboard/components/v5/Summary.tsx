"use client";

import { useEffect, useRef } from "react";
import { useV5 } from "./ctx";
import { usePage } from "./page";
import { DeltaChip, T } from "./bits";
import { DailyChart, goalSeries } from "./charts";
import { byGoalSpend, type VM } from "./core";

// The summary report (prototype openSummary): a manager-ready page written from the numbers.
export function SummaryModal({ vm: v, onClose }: { vm: VM; onClose: () => void }) {
  const { f } = useV5();
  const { toast } = usePage();
  const fx = v.summaryFacts;
  const goals = byGoalSpend(v);
  const main = goals[0];
  const great = v.great[0];
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const copy = () =>
    navigator.clipboard?.writeText(v.summaryReport).then(
      () => toast("Copied as text"),
      () => toast("Your browser blocked copying here."),
    );
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rp-t" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <article className="mbox print-root">
          <header>
            <div>
              <span className="label">Summary report</span>
              <h2 id="rp-t">{fx.title}</h2>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="button" onClick={copy}>
                Copy as text
              </button>
              <button className="btn" type="button" onClick={() => window.print()}>
                Print
              </button>
              <button className="btn" type="button" ref={ref} onClick={onClose}>
                Close
              </button>
            </div>
          </header>
          <div className="mbody">
            <p style={{ fontSize: 16, maxWidth: "70ch" }}>{fx.headline}</p>
            <div className="rtiles">
              <div className="tile">
                <span className="k">Spend</span>
                <span className="v">{f.money(v.spend)}</span>
                <DeltaChip change={v.spendChange} mode="neutral" />
              </div>
              {goals.slice(0, 3).map((o) => (
                <div className="tile" key={o.objective}>
                  <span className="k">
                    {o.label} · <T s={o.kpiShort} />
                  </span>
                  <span className="v">{f.kpi(o.value, o.mode)}</span>
                  <DeltaChip change={o.change} mode={o.mode} confidence={o.confidence} />
                </div>
              ))}
            </div>
            {main && (
              <section className="section">
                <h3>
                  {main.label}: the last {main.daily.length} days
                </h3>
                <div className="chartbox">
                  <DailyChart series={goalSeries(main)} from={v.from} to={v.to} h={190} />
                </div>
              </section>
            )}
            <section className="section">
              <h3>What changed</h3>
              <ul>
                {(fx.changes.length ? fx.changes : ["No comparable earlier period yet."]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
            <section className="section">
              <h3>What’s working</h3>
              <ul>
                <li>{fx.working ?? "Nothing stands out as a clear winner this period."}</li>
                {great && (
                  <li>
                    Consider more budget for <b>{great.campaign}</b> ({great.kpi}).
                  </li>
                )}
              </ul>
            </section>
            <section className="section">
              <h3>What I’m doing about it</h3>
              <ul>
                {(fx.doing.length ? fx.doing : ["Nothing needs changing right now; keep monitoring."]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
            {fx.next.length > 0 && (
              <section className="section">
                <h3>Next</h3>
                <ul>
                  {fx.next.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </section>
            )}
            {fx.caveats.length > 0 && (
              <section className="section">
                <h3>Caveats</h3>
                <ul>
                  {fx.caveats.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </section>
            )}
            <p className="small-note">
              Written from your numbers for {v.label}
              {v.compareLabel ? ` vs ${v.compareLabel}` : ""}.
            </p>
          </div>
        </article>
      </div>
    </>
  );
}
