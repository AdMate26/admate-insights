import { CircleAlert, CircleCheck, CircleHelp, Clock3, Minus, TriangleAlert } from "lucide-react";
import type { Confidence, Performance, PriorityTier } from "@/lib/analysis/engine";
import { cn } from "@/lib/utils";

const PERF_TONE: Record<Performance, string> = {
  High: "performance-excellent",
  Moderate: "performance-fair",
  Low: "performance-attention",
  "In Review": "performance-early",
  Error: "performance-check",
};

/** Customer-facing performance verdict — no numeric score, ever. */
export function PerformanceBadge({
  performance,
  className,
}: {
  performance: Performance;
  className?: string;
}) {
  const Icon =
    performance === "High"
      ? CircleCheck
      : performance === "Moderate"
        ? Minus
        : performance === "Low"
          ? CircleAlert
          : performance === "Error"
            ? TriangleAlert
            : Clock3;
  return (
    <span className={cn("performance-badge", PERF_TONE[performance], className)}>
      <Icon size={14} aria-hidden="true" />
      {performance}
    </span>
  );
}

const PILL_CLASS: Record<Performance, string> = {
  High: "status--high",
  Moderate: "status--moderate",
  Low: "status--low",
  "In Review": "status--review",
  Error: "status--error",
};

/** Compact performance pill for dense tables. No numeric score. */
export function StatusPill({ performance }: { performance: Performance }) {
  return <span className={cn("status-pill", PILL_CLASS[performance])}>{performance}</span>;
}

/** The analytical condition (e.g. "Creative fatigue"), never a bare metric. */
export function SignalBadge({ signal, className }: { signal: string; className?: string }) {
  return (
    <span className={cn("signal-label", className)}>
      {signal}
    </span>
  );
}

const TIER_LABEL: Record<PriorityTier, string> = {
  Critical: "Critical priority",
  High: "High priority",
  Medium: "Medium priority",
  Low: "Low priority",
};

export function PriorityBadge({ tier }: { tier: PriorityTier }) {
  return (
    <span className="priority-label">
      <span
        aria-hidden="true"
        className={cn("priority-dot", (tier === "Critical" || tier === "High") && "priority-dot-high")}
      />
      {TIER_LABEL[tier]}
    </span>
  );
}

/** Small chip describing the campaign's maturity/state. */
export function StateBadge({ label }: { label: string }) {
  return (
    <span className="signal-label" style={{ opacity: 0.85 }}>
      <CircleHelp size={12} aria-hidden="true" style={{ marginRight: 4, verticalAlign: "-2px" }} />
      {label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const bars = confidence === "High" ? 3 : confidence === "Medium" ? 2 : 1;
  return (
    <span className="confidence-label">
      <span className="confidence-bars" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= bars ? "filled" : ""} />
        ))}
      </span>
      {confidence} confidence
    </span>
  );
}
