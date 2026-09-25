import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { DashboardScreen } from "@/components/admate/DashboardScreen";
import { AccountErrorState } from "@/components/auth/AccountErrorState";
import { AuthPending } from "@/components/auth/AuthLayout";
import { allAnalysisQueryOptions } from "@/lib/analysis-query";
import { isOnboardingComplete, profileQueryOptions } from "@/lib/auth/profile";
import { requireSession } from "@/lib/auth/session";
import { validateDashboardSearch } from "@/lib/dashboard-search";

/**
 * /home — the signed-in AdMate workspace. Logged-out visitors go to /login;
 * signed-in users who haven't finished onboarding go to /onboarding. Resolved
 * on the client so nothing private renders before the session is checked.
 * Until ad accounts can be connected, it shows clearly labelled sample data.
 */
export const Route = createFileRoute("/home")({
  ssr: false,
  validateSearch: validateDashboardSearch,
  beforeLoad: async ({ context }) => {
    const session = await requireSession();
    const profile = await context.queryClient.ensureQueryData(profileQueryOptions(session.user.id));
    if (!isOnboardingComplete(profile.onboarding_status)) {
      throw redirect({ to: "/onboarding", replace: true });
    }
  },
  loaderDeps: ({ search }) => ({ brand: search.brand }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(allAnalysisQueryOptions(deps.brand)),
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
  component: WorkspaceDashboard,
});

function WorkspaceDashboard() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <DashboardScreen
      mode="workspace"
      search={search}
      onNavigate={(next) => navigate({ to: "/home", search: next })}
    />
  );
}
