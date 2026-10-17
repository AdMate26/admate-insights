import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { DashboardScreen } from "@/components/admate/DashboardScreen";
import { AccountErrorState } from "@/components/auth/AccountErrorState";
import { AuthPending } from "@/components/auth/AuthLayout";
import { allAnalysisQueryOptions, fetchWorkspaceAccess } from "@/lib/analysis-query";
import { isOnboardingComplete, profileQueryOptions } from "@/lib/auth/profile";
import { requireSession } from "@/lib/auth/session";
import { decideWorkspaceGate, needsWorkspaceAccessCheck } from "@/lib/auth/workspace-gate";
import { DEFAULT_BRAND } from "@/lib/brands";
import { validateWorkspaceSearch } from "@/lib/dashboard-search";

/**
 * /home — the signed-in AdMate workspace. Logged-out visitors go to /login;
 * signed-in users who haven't finished onboarding go to /onboarding, except the
 * server-verified owner, whose setup (the Meta connection) lives on the server.
 * Resolved on the client so nothing private renders before the session is
 * checked.
 * Demo brands show clearly labelled sample data; the live "My Account" brand
 * shows the owner's real Meta data and is only reachable by the verified owner
 * (also enforced on the server, which never returns live data to anyone else).
 */
export const Route = createFileRoute("/home")({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  beforeLoad: async ({ context, search }) => {
    const session = await requireSession();
    const profile = await context.queryClient.ensureQueryData(profileQueryOptions(session.user.id));
    const onboardingComplete = isOnboardingComplete(profile.onboarding_status);
    const { liveBrands } = needsWorkspaceAccessCheck({
      onboardingComplete,
      requestedBrand: search.brand,
    })
      ? await fetchWorkspaceAccess(context.queryClient, session.user.id)
      : { liveBrands: [] };
    const gate = decideWorkspaceGate({
      onboardingComplete,
      liveBrands,
      requestedBrand: search.brand,
    });
    if (gate === "onboarding") throw redirect({ to: "/onboarding", replace: true });
    // A live brand is only for the verified owner; anyone else lands on the
    // default demo brand instead of an error.
    if (gate === "default-brand") {
      throw redirect({ to: "/home", search: { brand: DEFAULT_BRAND }, replace: true });
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
