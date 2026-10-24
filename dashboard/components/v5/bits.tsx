"use client";

import type { ReactNode } from "react";
import { useV5 } from "./ctx";
import { CONF_RANK, drvName, GLOSS, higher, KIND, mainDriver, PLATFORM, signed, type Driver, type Item, type Mode } from "./core";

// Chips, tags and small labels shared by every view (prototype 10-shared.js).

export const ICON = {
  problem: (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1 11 10.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 4.6v2.6M6 8.7v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  opportunity: (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 10.5V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ok: (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wait: (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  ),
};

export function KindTag({ kind }: { kind: string | null | undefined }) {
  const k = kind ? KIND[kind] : null;
  if (!k) return null;
  return (
    <span className="kindtag">
      {ICON[k[1]]} {k[0]}
    </span>
  );
}
export function PrioChip({ p }: { p: string | null | undefined }) {
  if (!p) return null;
  return (
    <span className={`prio ${p}`} title="Priority: how much it matters now">
      {p === "monitor" ? "monitor" : `${p} priority`}
    </span>
  );
}
export function ConfDots({ c }: { c: string | null | undefined }) {
  const n = ({ high: 3, medium: 2, low: 1 } as Record<string, number>)[c ?? ""] ?? 1;
  return (
    <span className="conf" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} />
      ))}
    </span>
  );
}
export function ConfLabel({ c }: { c: string }) {
  return (
    <span className="conflabel" title="Confidence: how sure AdMate is about the numbers">
      <ConfDots c={c} /> {c} confidence
    </span>
  );
}
export function Plat({ p }: { p: string | null | undefined }) {
  return p ? <span className="plat">{PLATFORM[p] ?? p}</span> : null;
}
export function DeltaChip({ change, mode, confidence, vs }: { change: number | null | undefined; mode: Mode | string; confidence?: string | null; vs?: string | null }) {
  if (change == null) return <span className="delta flat">no comparison</span>;
  const flat = Math.abs(change) < 0.03;
  const good = higher(mode) ? change > 0 : change < 0;
  const cls = flat || confidence === "low" || mode === "neutral" ? "flat" : good ? "good" : "bad";
  return (
    <span className={`delta ${cls}`} title={vs ? `Change vs ${vs}` : undefined}>
      {flat ? "→" : change > 0 ? "▲" : "▼"} {signed(change)}
    </span>
  );
}
// "Campaign › Ad set › Ad" with a small level label before each part.
export function PathCrumbs({ where }: { where: string | null | undefined }) {
  const parts = String(where ?? "").split(" › ").filter(Boolean);
  const labels = parts.length === 3 ? ["Campaign", "Ad set", "Ad"] : parts.length === 2 ? ["Campaign", "Ad set"] : ["Campaign"];
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          <span className="lvl">{labels[i]}</span> <b>{p}</b>
        </span>
      ))}
    </>
  );
}
// Where a statement comes from: the uploaded numbers, AdMate's rule-based reading of them, or a suggestion.
const SRC = {
  data: ["data", "From your data", "Calculated directly from your uploaded reports."],
  read: ["read", "AdMate’s read", "AdMate’s interpretation of the numbers, using fixed, tested rules. A best explanation, not a certainty."],
  step: ["step", "Suggested step", "What AdMate suggests you do. You decide; AdMate never changes your ad account."],
  ai: ["ai", "AI answer", "Written by the AdMate Assistant (Claude) from your AdMate numbers. Check it against the numbers."],
} as const;
export function Src({ k }: { k: keyof typeof SRC }) {
  const [c, label, tip] = SRC[k];
  return (
    <span className={`src ${c}`} title={tip}>
      {label}
    </span>
  );
}
export function ImpactChip({ impact }: { impact: Item["impact"] | null | undefined }) {
  const { f } = useV5();
  if (!impact || !(impact.amount > 0)) return null;
  const good = impact.label === "saved" || impact.label === "extra revenue";
  const bad = impact.label === "extra cost" || impact.label === "lost revenue";
  return (
    <span
      className={`impact ${good ? "good" : bad ? "bad" : ""}`}
      title={impact.known ? "Compared with what AdMate expected (its own past, your target or similar items). Looking back only: not a forecast." : "Spend on this item in the period."}
    >
      <b>{f.money(impact.amount)}</b> <small>{impact.label}</small>
    </span>
  );
}
export function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="sw high" />
        High
      </span>
      <span>
        <i className="sw medium" />
        Medium
      </span>
      <span>
        <i className="sw low" />
        Low priority
      </span>
      <span>{ICON.problem} Problem</span>
      <span>{ICON.opportunity} Opportunity</span>
      <span>
        <ConfDots c="high" /> Confidence
      </span>
    </div>
  );
}
export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text}
      {children}
    </div>
  );
}
export function SectionHead({ title, hint, more, id }: { title: ReactNode; hint?: ReactNode; more?: ReactNode; id?: string }) {
  return (
    <header>
      <h2 id={id}>{title}</h2>
      {hint ? <span className="hint">{hint}</span> : null}
      {more ? <span className="more">{more}</span> : null}
    </header>
  );
}
// Ad terms explained on hover, except in Advanced, which sees them as-is.
export function T({ s }: { s: string }) {
  const { isAdv } = useV5();
  const g = GLOSS[s];
  return g && !isAdv ? (
    <abbr className="term" title={g}>
      {s}
    </abbr>
  ) : (
    <>{s}</>
  );
}
export function DriverChip({ drivers }: { drivers: Driver[] | null | undefined }) {
  const m = mainDriver(drivers);
  if (!m || Math.abs(m.change) < 0.03) return null;
  return (
    <span className={`drvchip ${m.helped ? "help" : "hurt"}`} title="Main driver of the change">
      {drvName(m.key, m.label).replace(/ \(.*\)$/, "")} {signed(m.change)}
    </span>
  );
}
export const confRank = (c: string) => CONF_RANK[c] ?? 9;
