import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { AccountErrorState } from "@/components/auth/AccountErrorState";
import { AuthLayout, AuthPending } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { isOnboardingComplete, profileQueryOptions } from "@/lib/auth/profile";
import { requireSession, useLogout } from "@/lib/auth/session";

/**
 * Onboarding entry for signed-in users whose profile says onboarding isn't
 * complete. Placeholder until the setup steps (Early Access, first brand, ad
 * accounts) are built — it never marks onboarding complete or activates a
 * subscription.
 */
export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const session = await requireSession();
    const profile = await context.queryClient.ensureQueryData(profileQueryOptions(session.user.id));
    if (isOnboardingComplete(profile.onboarding_status)) {
      throw redirect({ to: "/home", replace: true });
    }
    return { email: session.user.email ?? null };
  },
  head: () => ({ meta: [{ title: "Welcome to AdMate" }] }),
  pendingComponent: () => <AuthPending />,
  errorComponent: ({ error, reset }) => <AccountErrorState error={error} reset={reset} />,
  component: OnboardingPage,
});

function OnboardingPage() {
  const { email } = Route.useRouteContext();
  const logout = useLogout();

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome to AdMate</h1>
      <p className="mt-2 text-sm text-foreground">Your account is ready.</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Next, we&apos;ll set up your Early Access workspace and first brand.
      </p>

      <Button
        className="mt-6 w-full"
        onClick={() => toast("Workspace setup is coming in the next step.")}
      >
        Continue setup
        <ArrowRight size={16} />
      </Button>

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
