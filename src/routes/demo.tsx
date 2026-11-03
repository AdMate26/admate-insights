import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AuthPending } from "@/components/auth/AuthLayout";
import { currentAccessToken } from "@/lib/auth/session";
import { DASHBOARD_PATH, enterDashboard } from "@/lib/dashboard-bridge";
import { validateDashboardSearch } from "@/lib/dashboard-search";

/**
 * /demo — "Try AdMate". Opens the AdMate dashboard's demo (Project B, served at
 * /app): visitors get the shared, read-only Lotus Skincare sample without
 * signing in; signed-in users get their own interactive copy. Resolved in the
 * browser because the sign-in lives there.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,
  // Kept so existing links that carry ?brand= stay valid; the demo ignores it.
  validateSearch: validateDashboardSearch,
  head: () => ({
    meta: [
      { title: "Try AdMate — Demo" },
      {
        name: "description",
        content:
          "Explore AdMate on a sample ad account: every campaign judged on the metric its objective was bought against.",
      },
    ],
  }),
  component: OpenDemo,
});

function OpenDemo() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const accessToken = await currentAccessToken();
      // Signed in: make sure the dashboard knows (it then opens their own copy).
      // Whatever the answer, /app/demo decides: own copy or the public demo.
      if (accessToken) await enterDashboard({ accessToken });
      window.location.replace(`${DASHBOARD_PATH}/demo`);
    })();
  }, []);
  return <AuthPending label="Opening the demo…" />;
}
