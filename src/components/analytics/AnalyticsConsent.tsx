import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  analyticsAvailable,
  identifyUser,
  onAnalyticsSettings,
  readConsent,
  resetAnalytics,
  startAnalytics,
  writeConsent,
} from "@/lib/analytics/posthog";

/**
 * The analytics choice (PostHog) and, once allowed, which signed-in user this
 * browser belongs to. Rendered once in the root layout; shows nothing on the
 * server, without a PostHog key, or after the visitor has chosen (until they
 * reopen it from "Cookie settings").
 */
export function AnalyticsConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!analyticsAvailable()) return;
    if (readConsent() === "granted") startAnalytics();
    else if (readConsent() === null) setOpen(true);
    const stopListening = onAnalyticsSettings(() => setOpen(true));

    // Identity follows the Supabase session: user ID and email (after consent only).
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) identifyUser(session.user.id, session.user.email);
      else if (event === "SIGNED_OUT") resetAnalytics();
    });
    return () => {
      stopListening();
      data.subscription.unsubscribe();
    };
  }, []);

  if (!open) return null;

  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie choice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-border bg-background p-4 text-sm shadow-lg sm:inset-x-6"
    >
      <p className="text-foreground">
        <strong className="font-semibold">We use cookies</strong> to understand how visitors use our
        website (PostHog analytics). No recordings of your screen, and never your report data.{" "}
        <a href="/privacy#cookies" className="underline">
          Privacy
        </a>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => choose("granted")}>
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => choose("denied")}>
          Decline
        </Button>
      </div>
    </div>
  );
}
