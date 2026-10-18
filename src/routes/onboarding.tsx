import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { AccountErrorState } from "@/components/auth/AccountErrorState";
import { AuthLayout, AuthPending } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { workspaceAccessQueryOptions } from "@/lib/analysis-query";
import { isOnboardingComplete, profileQueryOptions } from "@/lib/auth/profile";
import { requireSession, useLogout } from "@/lib/auth/session";

/**
 * Onboarding entry for signed-in users whose profile says onboarding isn't
 * complete. Placeholder until the setup steps (Early Access, first brand, ad
 * accounts) are built — it never marks onboarding complete or activates a
 * subscription.
 *
 * The one exception is the owner: when the server verifies this session as
 * META_OWNER_USER_ID, their setup (the read-only Meta connection) is already
 * configured server-side, so "Continue" opens the live My Account workspace.
 * Nothing is written to the profile and other users see the placeholder.
 */
export const Route = createFileRoute("/onboarding")({
  ssr: false,
  // `access=pending`: /home sent this user here because the dashboard didn't
  // admit them (invite-only). Don't send them back to /home (that would loop).
  validateSearch: (search: Record<string, unknown>): { access?: "pending" } =>
    search["access"] === "pending" ? { access: "pending" } : {},
  beforeLoad: async ({ context, search }) => {
    const session = await requireSession();
    const profile = await context.queryClient.ensureQueryData(profileQueryOptions(session.user.id));
    if (isOnboardingComplete(profile.onboarding_status) && search.access !== "pending") {
      throw redirect({ to: "/home", replace: true });
    }
    return { email: session.user.email ?? null, userId: session.user.id };
  },
  head: () => ({ meta: [{ title: "Welcome to AdMate" }] }),
  pendingComponent: () => <AuthPending />,
  errorComponent: ({ error, reset }) => <AccountErrorState error={error} reset={reset} />,
  component: OnboardingPage,
});

function OnboardingPage() {
  const { email, userId } = Route.useRouteContext();
  const logout = useLogout();
  const navigate = useNavigate();
  const access = useQuery(workspaceAccessQueryOptions(userId));
  const isOwner = access.data?.liveBrands.includes("my_account") ?? false;

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome to AdMate</h1>
      <p className="mt-2 text-sm text-foreground">Your account is ready.</p>
      {isOwner ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This account has owner access to the live My Account workspace, which reads your
            configured Meta ad account (read-only).
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() =>
              void navigate({ to: "/home", search: { brand: "my_account" }, replace: true })
            }
          >
            Open My Account
            <ArrowRight size={16} />
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Next, we&apos;ll set up your Early Access workspace and first brand.
          </p>
          <Button
            className="mt-6 w-full"
            disabled={access.isPending}
            onClick={() => toast("Workspace setup is coming in the next step.")}
          >
            Continue setup
            <ArrowRight size={16} />
          </Button>
        </>
      )}

      <div className="mt-6 border-t border-border/70 pt-4 text-sm">
        {email ? (
          <p className="truncate text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span>
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <Link to="/demo" className="text-muted-foreground hover:text-foreground">
            Explore the demo
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-muted-foreground hover:text-foreground"
          >
            Log out
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
