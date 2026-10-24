"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePeriodQuery } from "../ctx";
import { ConfLabel, DeltaChip, Empty, KindTag, PathCrumbs, SectionHead } from "../bits";
import { kindOf, makeFmt, plural, STATE, type Item } from "../core";

// Advanced · Portfolio (prototype advPortfolio): every account at once.

type Brief = Pick<Item, "key" | "title" | "where" | "priority" | "bucket" | "kind" | "impact" | "confidence">;
export type AcctSummary = {
  id: string;
  name: string;
  industry: string | null;
  country: string | null;
  currency: string;
  isSample: boolean;
  data: null | {
    spend: number;
    spendChange: number | null;
    main: { label: string; kpiShort: string; value: number | null; mode: "cost" | "roas" | "cpm"; state: string; target: number | null } | null;
    goals: number;
    off: number;
    probs: number;
    high: Brief[];
    atStake: number;
    top: Brief | null;
    opps: number;
    tone: string;
  };
};

const TONE_WORD: Record<string, string> = { bad: "Needs action", warn: "Watch", good: "Healthy" };

export function Portfolio({ accounts }: { accounts: AcctSummary[] }) {
  const { q, qs } = usePeriodQuery();
  const fmts = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, makeFmt(a.currency)])), [accounts]);
  const live = accounts.filter((a) => a.data);
  const currencies = new Set(live.map((a) => a.currency));
  const f0 = makeFmt(live[0]?.currency ?? "USD");
  const spend = live.reduce((s, a) => s + a.data!.spend, 0);
  const needs = live.filter((a) => a.data!.tone === "bad").length;
  const stake = live.reduce((s, a) => s + a.data!.atStake, 0);
  const highN = live.reduce((s, a) => s + a.data!.high.length, 0);
  const cross = live
    .flatMap((a) => a.data!.high.map((d) => ({ a, d })))
    .sort((x, y) => (y.d.impact?.amount ?? 0) - (x.d.impact?.amount ?? 0))
    .slice(0, 6);
  const openHref = (id: string, key: string) => `/c/${id}/actions?${qs ? `${qs}&` : ""}open=${encodeURIComponent(key)}`;
  return (
    <>
      <div className="statusbar">
        <span className="stat">
          <span className="num">{currencies.size > 1 ? "—" : f0.money(spend)}</span> spend across {plural(accounts.length, "account")}
        </span>
        <span className={`stat ${needs ? "hi" : ""}`}>
          <span className="num">{needs}</span> {needs === 1 ? "account needs" : "accounts need"} action
        </span>
        <span className={`stat ${stake ? "hi" : ""}`}>
          <span className="num">{currencies.size > 1 ? "—" : f0.money(stake)}</span> at stake
        </span>
        <span className="stat">
          <span className="num">{highN}</span> high-priority problems
        </span>
      </div>
      {currencies.size > 1 && <p className="small-note">Your accounts use different currencies, so totals aren’t added up. Each row shows its own currency.</p>}
      <section className="section">
        <SectionHead title="Accounts" hint="Sorted by money at stake. Click an account to open it." />
        <div className="tablewrap">
          <table className="tbl" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Status</th>
                <th className="r">Spend</th>
                <th>Main goal</th>
                <th className="r">Goals off track</th>
                <th className="r">Problems</th>
                <th className="r">At stake</th>
                <th className="r">Opportunities</th>
                <th>Top problem</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const f = fmts[a.id];
                const x = a.data;
                const meta = [a.industry, a.country, a.isSample ? "sample" : ""].filter(Boolean).join(" · ");
                if (!x)
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link className="nm" href={`/c/${a.id}`}>
                          {a.name}
                        </Link>
                        <div className="sub">{meta}</div>
                      </td>
                      <td colSpan={8}>
                        <span className="muted">No data yet. </span>
                        <Link className="link" href={`/c/${a.id}/upload`}>
                          Upload a report
                        </Link>
                      </td>
                    </tr>
                  );
                const [gc, gw] = x.main ? (STATE[x.main.state] ?? STATE.unknown) : ["flat", "—"];
                return (
                  <tr key={a.id} className="click">
                    <td>
                      <Link className="nm" href={`/c/${a.id}${q}`}>
                        {a.name}
                      </Link>
                      <div className="sub">{meta}</div>
                    </td>
                    <td>
                      <span className={`tag ${x.tone}`}>{TONE_WORD[x.tone]}</span>
                    </td>
                    <td className="r">
                      <div className="num">{f.money(x.spend)}</div>
                      <DeltaChip change={x.spendChange} mode="neutral" />
                    </td>
                    <td>
                      {x.main ? (
                        <>
                          <div>
                            {x.main.label} ·{" "}
                            <span className="num">
                              {x.main.kpiShort} {f.kpi(x.main.value, x.main.mode)}
                            </span>
                          </div>
                          <div className="sub">
                            <span className={`state ${gc}`}>{gw}</span>
                            {x.main.target != null ? `target ${f.kpi(x.main.target, x.main.mode)}` : "no target"}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="r num">
                      {x.off} of {x.goals}
                    </td>
                    <td className="r num">
                      {x.probs}
                      {x.high.length > 0 && <> <span className="prio high">{x.high.length} high</span></>}
                    </td>
                    <td className={`r num ${x.atStake ? "worst" : ""}`}>{f.money(x.atStake)}</td>
                    <td className="r num">{x.opps}</td>
                    <td>
                      {x.top ? (
                        <Link className="link" href={openHref(a.id, x.top.key)}>
                          {x.top.title}
                        </Link>
                      ) : (
                        <span className="small-note">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <SectionHead title="Needs action now, across accounts" hint="High-priority problems, biggest money first" />
        {cross.length ? (
          <div className="rows">
            {cross.map(({ a, d }, i) => {
              const f = fmts[a.id];
              const im = d.impact;
              return (
                <Link key={`${a.id}${d.key}`} className={`irow orow ${d.priority}`} href={openHref(a.id, d.key)}>
                  <span className="n">{i + 1}</span>
                  <span className="body">
                    <span className="tags">
                      <span className="plat">{a.name}</span>
                      <KindTag kind={kindOf(d)} />
                    </span>
                    <span className="t">{d.title}</span>
                    {d.where && (
                      <span className="path">
                        <PathCrumbs where={d.where} />
                      </span>
                    )}
                  </span>
                  <span className="side-r">
                    {im && im.amount > 0 && (
                      <span className={`impact ${im.label === "saved" || im.label === "extra revenue" ? "good" : im.label === "spend involved" ? "" : "bad"}`}>
                        <b>{f.money(im.amount)}</b> <small>{im.label}</small>
                      </span>
                    )}
                    <ConfLabel c={d.confidence} />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <Empty title="Nothing urgent" text="No high-priority problems in any account for this period." />
        )}
      </section>
      <p className="small-note">Every account you own in AdMate, each analysed for the same period.</p>
    </>
  );
}
