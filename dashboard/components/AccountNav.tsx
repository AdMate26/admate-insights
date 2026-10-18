"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { openAsk } from "./askEvents";
import { cx } from "./ui";
import { apiPath } from "@/lib/integration/paths";

type IconName = "dashboard" | "recommendations" | "audience" | "campaigns" | "reports" | "upload" | "settings" | "ask";

const ITEMS: { href: string; label: string; icon: IconName; hint: string; badge?: "actions"; isNew?: boolean; keepPeriod: boolean }[] = [
  { href: "", label: "Overview", icon: "dashboard", hint: "How your account is doing", keepPeriod: true },
  { href: "/actions", label: "Actions", icon: "recommendations", hint: "Problems and opportunities to decide on (badge: decisions waiting)", badge: "actions", keepPeriod: true },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns", hint: "Every campaign, ad set and ad: which is doing well, and why", keepPeriod: true },
  { href: "/audience", label: "Audience insight", icon: "audience", hint: "Who responds, where, on which placement and when", isNew: true, keepPeriod: true },
  { href: "/reports", label: "Reports", icon: "reports", hint: "Your uploaded reports", keepPeriod: false },
  { href: "/upload", label: "Upload report", icon: "upload", hint: "Add a new export", keepPeriod: false },
  { href: "/settings", label: "Targets & settings", icon: "settings", hint: "Targets, break-even, account", keepPeriod: false },
];

// Keeps the selected period when moving between analysis pages.
export function AccountNav({ workspaceId, counts: initial, askAvailable }: { workspaceId: string; counts: { actions: number }; askAvailable: boolean }) {
  const path = usePathname();
  const search = useSearchParams();
  // Badges follow the selected period (the server-rendered counts are for the latest data).
  const [counts, setCounts] = useState(initial);
  const period = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"].map((k) => `${k}=${search.get(k) ?? ""}`).join("&");
  useEffect(() => {
    let live = true;
    fetch(`${apiPath("/api/counts")}?ws=${workspaceId}&${period}`)
      .then((r) => r.json())
      .then((c) => live && setCounts(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [workspaceId, period, path]);
  const keep = new URLSearchParams();
  for (const k of ["from", "to", "cmp", "cfrom", "cto", "report", "vs"]) {
    const v = search.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible md:pb-0">
      {ITEMS.map((t) => {
        const href = `/c/${workspaceId}${t.href}`;
        const active = t.href === "" ? path === href : path.startsWith(href);
        const n = t.badge ? counts[t.badge] : 0;
        return (
          <Link
            key={t.href}
            href={qs && t.keepPeriod ? `${href}?${qs}` : href}
            title={t.hint}
            className={cx(
              "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              active ? "bg-violet-soft font-medium text-violet" : "text-muted hover:bg-bg hover:text-fg",
            )}
          >
            <Icon name={t.icon} />
            <span className="flex-1">{t.label}</span>
            {n > 0 && (
              <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-bad px-1.5 text-[11px] font-medium text-white" title={`${n} decision${n === 1 ? "" : "s"} waiting`}>
                {n}
              </span>
            )}
            {t.isNew && <span className="num rounded bg-signal px-1 text-[9.5px] font-medium tracking-wider text-signal-ink">NEW</span>}
          </Link>
        );
      })}
      {askAvailable && (
        <button onClick={() => openAsk()} className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium text-violet hover:bg-bg md:mt-2">
          <Icon name="ask" />
          <span className="flex-1">Ask AdMate</span>
          <span className="num rounded border border-line px-1 text-[10px] text-muted">/</span>
        </button>
      )}
    </nav>
  );
}

// Small line icons (16px, currentColor).
function Icon({ name }: { name: IconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="shrink-0">
      {name === "dashboard" && (
        <>
          <rect x="2" y="2" width="5" height="6" rx="1" {...p} />
          <rect x="9" y="2" width="5" height="3.5" rx="1" {...p} />
          <rect x="9" y="7.5" width="5" height="6.5" rx="1" {...p} />
          <rect x="2" y="10" width="5" height="4" rx="1" {...p} />
        </>
      )}
      {name === "recommendations" && <path d="M8 1.8 14.2 8 8 14.2 1.8 8Z M8 5.5v3.2 M8 10.8v.1" {...p} />}
      {name === "audience" && (
        <>
          <circle cx="6" cy="5.5" r="2.3" {...p} />
          <path d="M2 13.5c.6-2.4 2.1-3.6 4-3.6s3.4 1.2 4 3.6 M10.5 3.5a2.2 2.2 0 0 1 0 4.2 M12 9.9c1.2.5 1.8 1.6 2.1 3.2" {...p} />
        </>
      )}
      {name === "campaigns" && <path d="M2.5 4h11 M2.5 8h11 M2.5 12h11 M5 2.5v11" {...p} />}
      {name === "reports" && (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...p} />
          <path d="M2.5 6.2h11 M2.5 9.8h11 M6.2 6.2v7.3" {...p} />
        </>
      )}
      {name === "upload" && <path d="M8 12.5V3.5 M4.5 7 8 3.5 11.5 7 M3 13.5h10" {...p} />}
      {name === "settings" && (
        <>
          <path d="M2.5 4.5h11 M2.5 11.5h11" {...p} />
          <circle cx="5.5" cy="4.5" r="1.7" {...p} fill="var(--surface)" />
          <circle cx="10.5" cy="11.5" r="1.7" {...p} fill="var(--surface)" />
        </>
      )}
      {name === "ask" && <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5Z" {...p} />}
    </svg>
  );
}
