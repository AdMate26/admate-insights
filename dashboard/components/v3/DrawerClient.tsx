"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { setFindingStatus } from "@/app/actions";
import { addDays, toISO } from "@/lib/dates";
import { buttonClass, cx } from "../ui";

const SELECTION_KEYS = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"] as const;
const fmtDay = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Side panel over the page. Closing it (✕, Escape, a click outside) removes ?open= from the URL.
export function DrawerShell({ closeHref, labelledBy, children }: { closeHref: string; labelledBy: string; children: ReactNode }) {
  const router = useRouter();
  const closeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.replace(closeHref, { scroll: false });
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => router.replace(closeHref, { scroll: false })} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col border-l border-line bg-bg shadow-2xl">
        <Link ref={closeRef} href={closeHref} scroll={false} replace className="absolute right-4 top-3 z-10 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg">
          Close ✕
        </Link>
        {children}
      </aside>
    </div>
  );
}

// Action taken / Remind me later / Dismiss. AdMate never changes the ad account.
export function DecisionBar({ workspaceId, itemKey, title, status, until, dismissReason, closeHref }: { workspaceId: string; itemKey: string; title: string; status: string; until: string | null; dismissReason: string | null; closeHref: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"" | "remind" | "dismiss">("");
  const selection = Object.fromEntries(SELECTION_KEYS.map((k) => [k, search.get(k) ?? undefined]));
  const today = toISO(new Date());
  const act = (s: "done" | "dismissed" | "snoozed" | "todo", reason?: string, days?: number) =>
    start(async () => {
      await setFindingStatus(workspaceId, itemKey, s, title, selection, reason, days);
      router.replace(closeHref, { scroll: false });
    });
  const closed = status === "done" || status === "dismissed" || status === "snoozed";

  if (closed)
    return (
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <span className="flex-1 text-xs text-muted">
          {status === "done" ? "Action taken. AdMate re-checks it after your next upload." : status === "snoozed" ? `Reminder set for ${until ? fmtDay(until) : "later"}.` : `Dismissed${dismissReason ? `: ${dismissReason}` : ""}.`}
        </span>
        <button className={buttonClass.ghost} disabled={pending} onClick={() => act("todo")}>
          {status === "snoozed" ? "Cancel reminder" : "Restore"}
        </button>
      </footer>
    );
  return (
    <footer className={cx("relative flex flex-wrap items-center gap-2 border-t border-line px-5 py-3", pending && "opacity-60")}>
      {mode === "remind" && (
        <div role="menu" className="absolute bottom-full right-5 mb-2 w-56 rounded-xl border border-line bg-bg p-1 shadow-xl">
          {(
            [
              [1, "Tomorrow"],
              [3, "In 3 days"],
              [7, "In a week"],
            ] as [number, string][]
          ).map(([n, l]) => (
            <button key={n} role="menuitem" disabled={pending} onClick={() => act("snoozed", undefined, n)} className="flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface">
              {l}
              <small className="num text-xs text-muted">{fmtDay(addDays(today, n))}</small>
            </button>
          ))}
        </div>
      )}
      {mode === "dismiss" ? (
        <>
          <span className="flex-1 text-xs text-muted">Why? It helps AdMate get better.</span>
          {["Not relevant", "Already handled", "Wrong"].map((r) => (
            <button key={r} className={buttonClass.ghost + " !px-2.5 !py-1 !text-xs"} disabled={pending} onClick={() => act("dismissed", r)}>
              {r}
            </button>
          ))}
          <button className={buttonClass.quiet} onClick={() => setMode("")}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-xs text-muted">AdMate never changes your ad account.</span>
          <button className={buttonClass.ghost + " !py-1.5"} aria-expanded={mode === "remind"} onClick={() => setMode((m) => (m === "remind" ? "" : "remind"))}>
            Remind me later ▾
          </button>
          <button className={buttonClass.ghost + " !py-1.5"} onClick={() => setMode("dismiss")}>
            Dismiss
          </button>
          <button className={buttonClass.primary + " !py-1.5"} disabled={pending} onClick={() => act("done")} title="You made the change. AdMate will check whether it worked.">
            Action taken
          </button>
        </>
      )}
    </footer>
  );
}
