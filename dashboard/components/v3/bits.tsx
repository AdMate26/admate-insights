import type { ReactNode } from "react";
import { money } from "@/lib/format";
import type { KpiMode } from "@/lib/metrics/objectives";
import { cx } from "../ui";

// Small shared pieces of the v3 screens. Colour = priority (how much it matters
// now): High red, Medium amber, Low grey. Good/bad is shown with icons and words.

export type Prio = "high" | "medium" | "low" | "monitor";
export type Kind = "issue" | "opportunity" | "on_track" | "learning" | "waiting" | "signal";

export const PRIO_BAR: Record<Prio, string> = { high: "bg-bad", medium: "bg-warn", low: "bg-faint", monitor: "bg-line" };

export function PrioChip({ p }: { p: Prio | null | undefined }) {
  if (!p) return null;
  const cls = p === "high" ? "bg-bad text-white" : p === "medium" ? "border border-warn bg-warn-soft text-warn" : "bg-surface-2 text-muted";
  return (
    <span className={cx("num inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider", cls)} title="Priority: how much it matters now">
      {p === "monitor" ? "monitor" : `${p} priority`}
    </span>
  );
}

const KIND: Record<Kind, [string, IconName]> = {
  issue: ["Problem", "problem"],
  opportunity: ["Opportunity", "opportunity"],
  on_track: ["On track", "ok"],
  learning: ["Learning", "wait"],
  waiting: ["Not enough data", "wait"],
  signal: ["Early signal", "wait"],
};

export function KindTag({ k }: { k: Kind | null | undefined }) {
  if (!k) return null;
  const [label, icon] = KIND[k];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line px-2 py-px text-xs">
      <Icon name={icon} /> {label}
    </span>
  );
}

type IconName = "problem" | "opportunity" | "ok" | "wait";
export function Icon({ name }: { name: IconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {name === "problem" && (
        <>
          <path d="M6 1 11 10.5H1Z" {...p} />
          <path d="M6 4.6v2.6M6 8.7v.1" {...p} />
        </>
      )}
      {name === "opportunity" && <path d="M6 10.5V2M2.5 5.5 6 2l3.5 3.5" {...p} />}
      {name === "ok" && <path d="M2 6.5 5 9.5 10 3" {...p} />}
      {name === "wait" && <circle cx="6" cy="6" r="4.4" {...p} strokeDasharray="2 2" />}
    </svg>
  );
}

export function ConfDots({ c }: { c: "high" | "medium" | "low" }) {
  const n = { high: 3, medium: 2, low: 1 }[c];
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx("h-1.5 w-1.5 rounded-full", i <= n ? "bg-fg" : "bg-line")} />
      ))}
    </span>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-bad" />
        High
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-warn" />
        Medium
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-faint" />
        Low priority
      </span>
      <span className="inline-flex items-center gap-1.5">
        · Colour = how much it matters now · <Icon name="problem" /> Problem / <Icon name="opportunity" /> Opportunity · <ConfDots c="high" /> confidence = how sure AdMate is
      </span>
    </div>
  );
}

// "Campaign X › Ad set Y › Ad Z", each part labelled.
export function PathCrumbs({ where }: { where: string | null }) {
  const parts = String(where ?? "").split(" › ").filter(Boolean);
  if (parts.length === 0) return null;
  const labels = parts.length === 3 ? ["Campaign", "Ad set", "Ad"] : parts.length === 2 ? ["Campaign", "Ad set"] : ["Campaign"];
  return (
    <span className="text-xs text-muted">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden> › </span>}
          <span className="num mr-1 text-[10px] uppercase tracking-wider text-faint">{labels[i]}</span>
          <b className="font-medium text-fg">{p}</b>
        </span>
      ))}
    </span>
  );
}

export const PLATFORM: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google", linkedin: "LinkedIn" };
export function Plat({ p }: { p: string | null | undefined }) {
  if (!p) return null;
  return <span className="num rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wider text-muted">{PLATFORM[p] ?? p}</span>;
}

export function fmtKpi(v: number | null | undefined, mode: KpiMode, cur = "USD") {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return mode === "roas" ? `${v.toFixed(2)}×` : money(v, cur);
}

// ▲▼ change; colour only when it's good/bad and the numbers are solid.
export function DeltaChip({ change, mode, confidence, title }: { change: number | null; mode: KpiMode | "neutral"; confidence?: "high" | "medium" | "low"; title?: string }) {
  if (change === null || !Number.isFinite(change)) return <span className="num text-xs text-faint">— no comparison</span>;
  const flat = Math.abs(change) < 0.03;
  const good = mode === "roas" ? change > 0 : change < 0;
  const cls = flat || confidence === "low" || mode === "neutral" ? "text-muted" : good ? "text-good" : "text-bad";
  const p = Math.abs(Math.round(change * 100));
  return (
    <span className={cx("num whitespace-nowrap text-xs font-medium", cls)} title={title}>
      {flat ? "→" : change > 0 ? "▲" : "▼"} {change > 0 ? "+" : change < 0 ? "−" : ""}
      {p}%
    </span>
  );
}

export function Section({ title, hint, action, children, id }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-line bg-bg p-4 md:p-5">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {children}
    </section>
  );
}
