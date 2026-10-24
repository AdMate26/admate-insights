"use client";

import Link from "next/link";
import { useV5, usePeriodQuery } from "./ctx";
import { usePage } from "./page";
import { ConfLabel, DriverChip, ImpactChip, KindTag, PathCrumbs, Plat, PrioChip } from "./bits";
import { firstSentence, isOpen, kindOf, plain, PRIO_PLAIN, rowOf, statusText, stepsOf, type Item } from "./core";
import { PAGE_HREF, type PageId } from "@/lib/levels";

// Links to another page of this account, keeping the selected period.
export function useHref() {
  const { ws } = useV5();
  const { qs } = usePeriodQuery();
  return (page: PageId, extra?: Record<string, string>) => {
    const q = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    const s = q.toString();
    return `/c/${ws}${PAGE_HREF[page]}${s ? `?${s}` : ""}`;
  };
}

// One problem or opportunity, ranked (prototype orow).
export function ORow({ d, i }: { d: Item; i: number }) {
  const { vm, open } = usePage();
  const r = rowOf(vm!, d.entity as never);
  const closed = !isOpen(d);
  return (
    <button className={`irow orow ${d.priority}${closed ? " closed" : ""}`} type="button" onClick={() => open(d.key)}>
      <span className="n">{i + 1}</span>
      <span className="body">
        <span className="tags">
          <PrioChip p={d.priority} />
          <KindTag kind={kindOf(d)} />
          <Plat p={d.platform} />
          <DriverChip drivers={r?.drivers} />
        </span>
        <span className="t">{d.title}</span>
        {d.where && (
          <span className="path">
            <PathCrumbs where={d.where} />
          </span>
        )}
        {closed && <span className="sub">{statusText(d)}</span>}
      </span>
      <span className="side-r">
        <ImpactChip impact={d.impact} />
        <ConfLabel c={d.confidence} />
        <span className="link small">Investigate →</span>
      </span>
    </button>
  );
}

// Beginner: one thing to do, with its steps and the buttons to tick it off (prototype tcard).
export function TCard({ d, i, big }: { d: Item; i: number; big?: boolean }) {
  const { f } = useV5();
  const { vm, open, decide, ask, askAvailable } = usePage();
  const steps = stepsOf(d).slice(0, 3);
  const camp = String(d.where ?? "").split(" › ")[0];
  const closed = !isOpen(d);
  const im = d.impact;
  const moneyLine =
    im && im.known && im.amount > 0 ? (
      im.label === "saved" ? (
        <> It saved you about <b>{f.money(im.amount)}</b> compared with what AdMate expected.</>
      ) : im.label === "extra revenue" ? (
        <> It brought about <b>{f.money(im.amount)}</b> more in sales than expected.</>
      ) : (
        <> This cost you about <b>{f.money(im.amount)}</b> {im.label === "lost revenue" ? "in lost sales" : "extra"}.</>
      )
    ) : null;
  return (
    <div className={`tcard ${d.priority}${closed ? " closed" : ""}${big ? " big" : ""}`}>
      <span className="n" aria-hidden="true">
        {i + 1}
      </span>
      <span className="label" style={{ fontSize: 10.5 }}>
        {PRIO_PLAIN[d.priority] ?? ""}
        {camp ? ` · ${camp}` : ""}
      </span>
      <span className="t">{plain(d.title)}</span>
      <p className="why">
        {plain(firstSentence(d.description))}
        {moneyLine}
      </p>
      {steps.length > 0 && (
        <div>
          <span className="label" style={{ fontSize: 10.5 }}>
            How to do it
          </span>
          <ol>
            {steps.map((s) => (
              <li key={s}>{plain(s)}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="acts">
        {closed ? (
          <>
            <span className="small-note">{statusText(d)}</span>
            <button className="btn small" type="button" onClick={() => decide(d.key, "restore")}>
              Undo
            </button>
          </>
        ) : (
          <>
            <button className="btn primary small" type="button" onClick={() => decide(d.key, "done")}>
              I did this
            </button>
            <button className="btn small" type="button" onClick={() => decide(d.key, "remind", 1)}>
              Remind me tomorrow
            </button>
          </>
        )}
        <button className="link" type="button" onClick={() => open(d.key)}>
          Explain more
        </button>
        {askAvailable && vm && (
          <button className="link" type="button" onClick={() => ask(d.key)}>
            Ask the Assistant
          </button>
        )}
      </div>
    </div>
  );
}

export function GoLink({ page, extra, className, children }: { page: PageId; extra?: Record<string, string>; className?: string; children: React.ReactNode }) {
  const href = useHref();
  return (
    <Link href={href(page, extra)} className={className}>
      {children}
    </Link>
  );
}
