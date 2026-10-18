import Link from "next/link";
import { money } from "@/lib/format";
import type { Item } from "@/lib/analysis/insights";
import { ConfDots, KindTag, PathCrumbs, Plat, PRIO_BAR, PrioChip } from "./bits";
import { cx } from "../ui";

const fmtDay = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function statusText(d: Pick<Item, "status" | "until" | "dismissReason">): string | null {
  if (d.status === "done") return "Action taken";
  if (d.status === "snoozed") return `Reminder set for ${d.until ? fmtDay(d.until) : "later"}`;
  if (d.status === "dismissed") return `Dismissed${d.dismissReason ? `: ${d.dismissReason}` : ""}`;
  if (d.status === "in_review") return "In review";
  return null;
}

// One problem / opportunity / signal in a list. Click opens the drawer.
export function ItemRow({ d, href, start = false, currency }: { d: Item; href: string; start?: boolean; currency: string }) {
  const kind = d.bucket === "problem" ? "issue" : d.bucket === "opportunity" ? "opportunity" : "signal";
  const e = d.evidence[0];
  const closed = d.status === "done" || d.status === "dismissed" || d.status === "snoozed";
  const st = statusText(d);
  return (
    <Link href={href} scroll={false} className={cx("relative grid grid-cols-1 gap-x-4 gap-y-1 border-t border-line py-3 pl-5 pr-3 first:border-t-0 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", closed && "opacity-70")}>
      <span aria-hidden className={cx("absolute inset-y-0 left-0 w-[5px]", PRIO_BAR[d.priority])} />
      <span className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {start && !closed && <span className="num rounded bg-signal px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-signal-ink">Start here</span>}
          <PrioChip p={d.priority} />
          <KindTag k={kind} />
          <Plat p={d.platform} />
        </span>
        <span className="font-medium">{d.title}</span>
        <PathCrumbs where={d.where} />
        <span className="flex flex-wrap gap-x-3 text-xs text-muted">
          {e && (
            <span className="num">
              {e.label} {e.a ? `${e.a} → ` : ""}
              {e.b}
            </span>
          )}
          {st && <span>{st}</span>}
        </span>
      </span>
      <span className="flex items-center gap-4 sm:grid sm:justify-items-end sm:gap-1">
        <span className="num text-sm">
          {money(d.stake, currency)} <small className="text-xs text-muted">{Math.round(d.share * 100)}% of spend</small>
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted" title="Confidence: how sure AdMate is about the numbers">
          <ConfDots c={d.confidence} /> {d.confidence} confidence
        </span>
      </span>
    </Link>
  );
}
