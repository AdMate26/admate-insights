import type { Confidence, Severity, Signal, Status } from "@/lib/analysis/engine";
import { cn } from "@/lib/utils";

const SIGNAL_TONE: Record<Signal, string> = {
  tracking_issue: "border-destructive/40 bg-destructive/10 text-destructive",
  cpa_deterioration: "border-destructive/40 bg-destructive/10 text-destructive",
  cpm_spike: "border-destructive/30 bg-destructive/5 text-destructive",
  creative_fatigue: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ctr_drop: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  scaling_efficiency: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  strong_improvement: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  stable: "border-border bg-muted text-muted-foreground",
  low_volume: "border-border bg-muted text-muted-foreground",
};

const STATUS_TONE: Record<Status, string> = {
  needs_attention: "border-destructive/40 bg-destructive/10 text-destructive",
  watch: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  stable: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  data_confidence: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

/** STATUS badge — the coarse action bucket assigned by the rule engine. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE[status],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** SIGNAL badge — the specific detected pattern. */
export function SignalBadge({
  signal,
  label,
  className,
}: {
  signal: Signal;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        SIGNAL_TONE[signal],
        className,
      )}
    >
      {label}
    </span>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical priority",
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
  info: "Informational",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          severity === "critical" || severity === "high"
            ? "bg-destructive"
            : severity === "medium"
              ? "bg-amber-500"
              : severity === "low"
                ? "bg-muted-foreground/50"
                : "bg-emerald-500",
        )}
      />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        confidence === "High"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : confidence === "Medium"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      {confidence} confidence
    </span>
  );
}
