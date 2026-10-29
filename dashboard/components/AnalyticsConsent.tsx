"use client";

import { useEffect, useState } from "react";
import { analyticsAvailable, onAnalyticsSettings, readConsent, startAnalytics, writeConsent } from "@/lib/analytics";
import { buttonClass } from "./ui";

// AdMate integration: the analytics choice (PostHog), shared with the website
// (same site, same stored choice). Shows nothing without a PostHog key or once
// the person has chosen, until reopened from "Cookie settings".
export function AnalyticsConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!analyticsAvailable()) return;
    const consent = readConsent();
    if (consent === "granted") startAnalytics();
    // Shown after mount only, so server and browser render the same markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else if (consent === null) setOpen(true);
    return onAnalyticsSettings(() => setOpen(true));
  }, []);

  if (!open) return null;
  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    setOpen(false);
  };

  return (
    <div role="dialog" aria-label="Cookie choice" className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-xl rounded-xl border border-line bg-bg p-4 text-sm text-fg shadow-lg sm:inset-x-6">
      <p>
        <strong className="font-semibold">We use cookies</strong> to understand how visitors use our website (PostHog analytics). No recordings of your screen, and never your report data.{" "}
        <a href="/privacy#cookies" className="underline">
          Privacy
        </a>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass.primary} onClick={() => choose("granted")}>
          Accept
        </button>
        <button type="button" className={buttonClass.ghost} onClick={() => choose("denied")}>
          Decline
        </button>
      </div>
    </div>
  );
}
