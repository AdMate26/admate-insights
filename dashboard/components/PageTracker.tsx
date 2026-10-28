"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsAvailable, trackPageview } from "@/lib/analytics";
import { apiPath } from "@/lib/integration/paths";

// AdMate integration: page views for product analytics.
// - Signed in: tells AdMate's server (/api/activity) which page was opened and
//   how long it stayed open; the server records it with the person's account
//   (lib/analytics-server.ts). No tracking cookie or browser storage.
// - Not signed in (public demo): a browser page view, only after the visitor
//   accepted cookies (lib/analytics.ts).
function send(kind: "view" | "leave", path: string, seconds?: number, beacon = false) {
  const body = JSON.stringify({ kind, path, ...(seconds === undefined ? {} : { seconds }) });
  const url = apiPath("/api/activity");
  if (beacon && navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  void fetch(url, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body }).catch(() => {});
}

export function PageTracker({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();

  useEffect(() => {
    if (!analyticsAvailable()) return;
    if (!signedIn) {
      trackPageview();
      return;
    }
    let openedAt = Date.now();
    let open = true;
    send("view", path);
    const leave = (beacon: boolean) => {
      if (!open) return;
      open = false;
      send("leave", path, (Date.now() - openedAt) / 1000, beacon);
    };
    // Hidden tab or closed page: the page is left. Back to the tab: a new view.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave(true);
      else if (!open) {
        open = true;
        openedAt = Date.now();
        send("view", path);
      }
    };
    const onPageHide = () => leave(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      leave(false);
    };
  }, [path, signedIn]);

  return null;
}
