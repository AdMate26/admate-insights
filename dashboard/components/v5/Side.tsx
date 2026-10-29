"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { analyticsAvailable, identifyUser, openAnalyticsSettings, resetAnalytics } from "@/lib/analytics";
import { loadSampleData } from "@/app/actions";
import { signOut } from "@/app/(auth)/actions";
import { KEEPS_PERIOD, MENUS, PAGE_HREF, PERIOD_KEYS, type MenuIcon } from "@/lib/levels";
import { useV5 } from "./ctx";
import { apiPath } from "@/lib/integration/paths";

// The sidebar (prototype .side): wordmark, the ad account picker, the menu with
// badges, and the footer. AdMate has one view (Advanced), so there is no view picker.

const IC: Record<MenuIcon, string> = {
  home: "M2 2h5v6H2z M9 2h5v3.5H9z M9 7.5h5V14H9z M2 10h5v4H2z",
  todo: "M2.5 4.5 4 6l2.5-2.5 M2.5 10.5 4 12l2.5-2.5 M8.5 5h5 M8.5 11h5",
  myads: "M2.5 6.2v3.6h2.2L10 13V3L4.7 6.2Z M12.2 5.8c.8.6 1.2 1.3 1.2 2.2s-.4 1.6-1.2 2.2",
  optimize: "M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4Z M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z M8 1v2.2 M8 12.8V15 M1 8h2.2 M12.8 8H15",
  campaigns: "M2.5 4h11 M2.5 8h11 M2.5 12h11 M5 2.5v11",
  audience: "M6 3.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Z M2 13.5c.6-2.4 2.1-3.6 4-3.6s3.4 1.2 4 3.6 M10.5 3.5a2.2 2.2 0 0 1 0 4.2 M12 9.9c1.2.5 1.8 1.6 2.1 3.2",
  portfolio: "M2 2h5v5H2z M9 2h5v5H9z M2 9h5v5H2z M9 9h5v5H9z",
  actions: "M8 1.8 14.2 8 8 14.2 1.8 8Z M8 5.5v3.2 M8 10.8v.1",
  explorer: "M2 2.5h12v11H2z M2 6h12 M6 6v7.5 M10 6v7.5",
  budget: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Z M8 2v6l4.3 4.2",
  alerts: "M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11Z M6.5 13.5a1.5 1.5 0 0 0 3 0",
  reports: "M2.5 2.5h11v11h-11z M2.5 6.2h11 M2.5 9.8h11 M6.2 6.2v7.3",
  geography: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Z M1.8 8h12.4 M8 1.8c1.8 1.7 2.6 3.8 2.6 6.2s-.8 4.5-2.6 6.2 M8 1.8C6.2 3.5 5.4 5.6 5.4 8s.8 4.5 2.6 6.2",
  report: "M3.5 1.8h6l3 3v9.4h-9z M9.5 1.8v3h3 M5.8 12v-2.4 M8 12V7.6 M10.2 12V9",
  upload: "M8 12.5V3.5 M4.5 7 8 3.5 11.5 7 M3 13.5h10",
  settings: "M2.5 4.5h11 M2.5 11.5h11 M5.5 2.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z M10.5 9.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z",
};

export function Side({ counts: initial, userId }: { counts: { actions: number; alerts: number }; userId: string }) {
  const { ws, level, accounts, isAdv, email, readOnly } = useV5();
  const path = usePathname();
  const search = useSearchParams();
  const [pop, setPop] = useState<null | "acct">(null);
  const [counts, setCounts] = useState(initial);
  const side = useRef<HTMLElement>(null);
  const keep = new URLSearchParams();
  for (const k of PERIOD_KEYS) {
    const v = search.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();
  // Badges follow the selected period.
  useEffect(() => {
    let live = true;
    fetch(apiPath(`/api/counts?ws=${ws}&${qs}`))
      .then((r) => r.json())
      .then((c) => live && c && typeof c.actions === "number" && setCounts({ actions: c.actions, alerts: c.alerts ?? 0 }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ws, qs, path]);
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => !(e.target as HTMLElement).closest(".pickwrap") && setPop(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pop]);
  // Moving to another page closes the pickers.
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setPop(null);
  }

  const acct = accounts.find((a) => a.id === ws);
  const meta = (a: { industry: string | null; country: string | null }) => [a.industry, a.country].filter(Boolean).join(" · ");

  return (
    <aside className="side" aria-label="AdMate" ref={side}>
      <Link className="wordmark" href={`/c/${ws}`} aria-label="AdMate home">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M6 58 L25 6 L39 6 L58 58 L44 58 L32 25.2 L20 58 Z" fill="var(--violet)" />
          <rect x="21" y="30.7" width="22" height="11" rx="5.5" fill="var(--signal)" />
        </svg>
        <span>
          <span className="ad">Ad</span>
          <span className="mate">Mate</span>
        </span>
      </Link>
      <div className="pickwrap">
        <button className="pickbtn" type="button" aria-expanded={pop === "acct"} aria-haspopup="true" onClick={() => setPop(pop === "acct" ? null : "acct")}>
          <span className="label">Ad account</span>
          <b>{acct?.name ?? "Your account"}</b>
          <small>{acct ? meta(acct) : ""}</small>
          <span className="chev" aria-hidden="true">
            ▾
          </span>
        </button>
        {pop === "acct" && (
          <div className="pop" role="menu">
            {isAdv && (
              <>
                <Link role="menuitem" href={`/c/${ws}/portfolio${qs ? `?${qs}` : ""}`} className="popitem">
                  <b>All accounts</b>
                  <small>Portfolio overview</small>
                </Link>
                <hr />
              </>
            )}
            {accounts.map((a) => (
              <Link key={a.id} role="menuitemradio" aria-checked={a.id === ws} href={`/c/${a.id}`} className="popitem">
                <b>
                  {a.name}
                  {a.id === ws ? " ✓" : ""}
                </b>
                <small>{[meta(a), a.isSample ? "sample" : ""].filter(Boolean).join(" · ")}</small>
              </Link>
            ))}
            <hr />
            <Link role="menuitem" href="/accounts/new" className="popitem">
              <b>+ Add an ad account</b>
            </Link>
            <hr />
            <form action={signOut} onSubmit={resetAnalytics}>
              <button type="submit" role="menuitem" style={{ width: "100%" }}>
                <b>Sign out</b>
                <small>{email}</small>
              </button>
            </form>
          </div>
        )}
      </div>
      <nav className="nav" aria-label="Pages">
        {MENUS[level].map((g) => (
          <div key={g.group ?? "main"} style={{ display: "contents" }}>
            {g.group && <span className="grp">{g.group}</span>}
            {g.items.map((t) => {
              const href = `/c/${ws}${PAGE_HREF[t.page]}`;
              const active = t.page === "overview" ? path === href : path.startsWith(href);
              const n = t.badge ? counts[t.badge] : 0;
              return (
                <Link key={t.page} href={qs && KEEPS_PERIOD.has(t.page) ? `${href}?${qs}` : href} title={t.hint} aria-current={active ? "page" : undefined} className="navbtn">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={IC[t.icon]} />
                  </svg>
                  <span>{t.label}</span>
                  {n > 0 ? <span className="count">{n}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        {readOnly ? (
          // AdMate integration: public demo visitors aren't signed in. /login is on the website.
          <a href="/login">Log in or sign up free</a>
        ) : (
          <>
            <form action={loadSampleData}>
              <button type="submit">{accounts.some((a) => a.isSample) ? "Reset the sample account" : "Explore the sample account"}</button>
            </form>
            <span className="user" title={email}>
              {email}
            </span>
            <form action={signOut} onSubmit={resetAnalytics}>
              <button type="submit">Sign out</button>
            </form>
            <Identify userId={userId} email={email} />
          </>
        )}
        {/* AdMate integration: the website's legal pages (outside the /app basePath). */}
        <p className="side-legal">
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
          {analyticsAvailable() && (
            <button type="button" className="link" onClick={openAnalyticsSettings}>
              Cookie settings
            </button>
          )}
        </p>
      </div>
    </aside>
  );
}

// Tells analytics who this is: the Supabase user ID and email, only if the
// person allowed analytics (lib/analytics.ts).
function Identify({ userId, email }: { userId: string; email: string }) {
  useEffect(() => identifyUser(userId, email), [userId, email]);
  return null;
}
