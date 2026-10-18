import Link from "next/link";
import type { ReactNode } from "react";
import { signedPct } from "@/lib/format";
import type { Confidence } from "@/lib/analysis/stats";
import type { Priority, Verdict } from "@/lib/analysis/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-bg", className)}>{children}</div>;
}

export function ButtonLink({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "ghost"; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        variant === "primary" ? "bg-violet text-white hover:opacity-90" : "border border-line text-fg hover:bg-surface",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export const buttonClass = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-violet px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50",
  quiet: "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-fg",
};

// Polarity-aware delta: colour means good/bad, never direction alone; an arrow
// and sign always accompany the colour. Low-confidence deltas are muted.
export function Delta({ change, polarity, confidence, className }: { change: number | null; polarity: "lower" | "higher" | null; confidence?: Confidence; className?: string }) {
  if (change === null || !Number.isFinite(change)) return <span className={cx("num text-xs text-faint", className)}>—</span>;
  const flat = Math.abs(change) < 0.005;
  const good = polarity === null || flat ? null : polarity === "lower" ? change < 0 : change > 0;
  const low = confidence === "low";
  const color = low || good === null ? "text-muted" : good ? "text-violet" : "text-bad";
  return (
    <span
      className={cx("num inline-flex items-center gap-0.5 text-xs font-medium", color, low && "opacity-70", className)}
      title={low ? "Low volume — treat as an early signal" : confidence ? `Confidence: ${confidence}` : undefined}
    >
      <span aria-hidden>{flat ? "→" : change > 0 ? "▲" : "▼"}</span>
      {signedPct(change)}
      {low && <span className="ml-1 text-[10px] uppercase tracking-wide text-faint">low vol.</span>}
    </span>
  );
}

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-bad-soft text-bad" },
  attention: { label: "Needs attention", cls: "bg-warn-soft text-warn" },
  on_track: { label: "On track", cls: "bg-surface-2 text-muted" },
  outperforming: { label: "Outperforming", cls: "bg-violet-soft text-violet" },
  watch: { label: "Watch", cls: "border border-dashed border-line text-muted" },
  learning: { label: "Learning", cls: "bg-surface-2 text-muted" },
  no_data: { label: "Not enough data", cls: "text-faint" },
  idle: { label: "No delivery", cls: "text-faint" },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return <span className={cx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", v.cls)}>{v.label}</span>;
}

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: "High priority", cls: "bg-bad-soft text-bad" },
  medium: { label: "Medium", cls: "bg-warn-soft text-warn" },
  low: { label: "Low", cls: "bg-surface-2 text-muted" },
  monitor: { label: "Monitor", cls: "border border-dashed border-line text-muted" },
};

export function PriorityChip({ priority, opportunity = false }: { priority: Priority; opportunity?: boolean }) {
  const p = PRIORITY[priority];
  const opp = opportunity && priority !== "monitor";
  return (
    <span className={cx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", opp ? "bg-violet-soft text-violet" : p.cls)}>
      {opp ? `Opportunity · ${p.label.replace(" priority", "")}` : p.label}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  return (
    <span className="label !text-[10px]" title="How sure AdMate is, based on volume and a statistical test">
      {confidence} confidence
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  const label: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", linkedin: "LinkedIn" };
  return <span className="label !text-[10px] rounded border border-line px-1.5 py-0.5">{label[platform] ?? platform}</span>;
}
