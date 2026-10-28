import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AccountErrorState } from "@/components/auth/AccountErrorState";
import { AuthPending } from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { profileQueryOptions } from "@/lib/auth/profile";
import { requireSession } from "@/lib/auth/session";
import { signInMethod, trackBeforeLeaving } from "@/lib/analytics/posthog";
import { enterDashboard } from "@/lib/dashboard-bridge";
import { validateWorkspaceSearch } from "@/lib/dashboard-search";

/**
 * /home — where sign-in lands. Logged-out visitors go to /login; a missing or
 * unreadable profile is shown as an account error.
 *
 * It then hands the Supabase sign-in to the AdMate dashboard at /app (Project
 * B, dashboard/): the dashboard verifies the session with Supabase and opens
 * the user's own workspace (open registration for the submission MVP; created
 * once, on the first sign-in). If the dashboard refuses or is unavailable the
 * user goes to /onboarding, never into anyone else's workspace. Resolved on the
 * client so nothing private renders before the session is checked.
 */
export const Route = createFileRoute("/home")({
  ssr: false,
  // Kept so existing links that carry ?brand= stay valid; the dashboard ignores it.
  validateSearch: validateWorkspaceSearch,
  beforeLoad: async ({ context }) => {
    const session = await requireSession();
    await context.queryClient.ensureQueryData(profileQueryOptions(session.user.id));
  },
  head: () => ({
    meta: [
      { title: "AdMate — Workspace" },
      {
        name: "description",
        content:
          "AdMate judges every campaign on the metric its objective was bought against, across each brand's connected platforms.",
      },
    ],
  }),
  pendingComponent: () => <AuthPending />,
  errorComponent: ({ error, reset }) => <AccountErrorState error={error} reset={reset} />,
  component: EnterDashboard,
});

function EnterDashboard() {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      // `next` is set by the dashboard when it sent a signed-out visitor here;
      // enterDashboard only ever returns a path inside /app.
      const next = new URLSearchParams(window.location.search).get("next");
      const outcome = await enterDashboard({ accessToken: data.session?.access_token, next });
      if (outcome.kind === "dashboard") {
        if (outcome.firstEntry) {
          const provider = data.session?.user.app_metadata?.provider;
          await trackBeforeLeaving("signup_completed", { method: signInMethod(provider) });
        }
        window.location.replace(outcome.href);
      } else if (outcome.kind === "login") void navigate({ to: "/login", replace: true });
      else {
        // Not admitted (invite-only), or the dashboard is unreachable.
        void navigate({ to: "/onboarding", search: { access: "pending" }, replace: true });
      }
    })();
  }, [navigate]);

  return <AuthPending label="Opening your dashboard…" />;
}
