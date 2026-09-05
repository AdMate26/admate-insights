import { CircleAlert, CircleCheck, CircleHelp, Clock3, Minus } from "lucide-react";
import type {
  Confidence,
  PerformanceRating,
  Severity,
  Signal,
  Status,
} from "@/lib/analysis/engine";
import { cn } from "@/lib/utils";

const RATING_TONE: Record<PerformanceRating, string> = {
  "Very Good": "performance-excellent",
  Good: "performance-good",
  Fair: "performance-fair",
  "Needs Attention": "performance-attention",
};

export function PerformanceBadge({
  rating,
  label,
  className,
}: {
  rating: PerformanceRating | null;
  label: string;
  className?: string;
}) {
  const Icon =
    rating === "Very Good" || rating === "Good"
      ? CircleCheck
      : rating === "Needs Attention"
        ? CircleAlert
        : rating === "Fair"
          ? Minus
          : label === "Check Data"
            ? CircleHelp
            : Clock3;
  return (
    <span
      className={cn(
        "performance-badge",
        rating
          ? RATING_TONE[rating]
          : label === "Check Data"
            ? "performance-check"
            : "performance-early",
        className,
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}

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
        "performance-badge",
        status === "needs_attention" ? "performance-attention" : "performance-early",
        className,
      )}
    >
      {label}
    </span>
  );
}

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
    <span className={cn("signal-label", className)} data-signal={signal}>
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
    <span className="priority-label">
      <span
        aria-hidden="true"
        className={cn(
          "priority-dot",
          (severity === "critical" || severity === "high") && "priority-dot-high",
        )}
      />
      {SEVERITY_LABEL[severity]}
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
