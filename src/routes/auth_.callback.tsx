import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { AuthLayout, AuthPending } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { describeRedirectError, readRedirectError } from "@/lib/auth/methods";
import { ProfileLoadError, ProfileMissingError } from "@/lib/auth/profile";
import { completeSignIn, useLogout } from "@/lib/auth/session";

/**
 * /auth/callback — where Google OAuth and email links return, and where the
 * email-code flow lands after verification. Completes the Supabase session,
 * validates it, reads the user's own profile, and routes to onboarding or the
 * workspace.
 */
export const Route = createFileRoute("/auth_/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Signing in — AdMate" }] }),
  component: AuthCallback,
});

type Failure = {
  title: string;
  message: string;
  // Signed in but the account couldn't be loaded: offer retry + log out.
  signedIn: boolean;
};

function failureFor(error: unknown): Failure {
  if (error instanceof ProfileMissingError) {
    return {
      title: "We couldn't finish setting up your account",
      message:
        "Your sign-in worked, but your AdMate profile isn't ready yet. Please try again in a moment.",
      signedIn: true,
    };
  }
  if (error instanceof ProfileLoadError) {
    return {
      title: "We couldn't load your account",
      message: "Something went wrong while loading your account. Please try again.",
      signedIn: true,
    };
  }
  return {
    title: "We couldn't sign you in",
    message: "Please try again.",
    signedIn: false,
  };
}

function AuthCallback() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useLogout();
  // Read any provider error before the Supabase client inspects the URL.
  const [redirectError] = useState(() => readRedirectError(window.location));
  const [failure, setFailure] = useState<Failure | null>(() =>
    redirectError
      ? {
          title: "We couldn't sign you in",
          message: describeRedirectError(redirectError),
          signedIn: false,
        }
      : null,
  );
  const started = useRef(false);

  const finish = useCallback(async () => {
    setFailure(null);
    try {
      const destination = await completeSignIn(queryClient);
      await navigate({ to: destination, replace: true });
    } catch (error) {
      setFailure(failureFor(error));
    }
  }, [navigate, queryClient]);

  useEffect(() => {
    if (redirectError || started.current) return;
    started.current = true;
    void finish();
  }, [finish, redirectError]);

  if (!failure) return <AuthPending label="Signing you in…" />;

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{failure.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{failure.message}</p>
      <div className="mt-6 flex flex-col gap-2">
        {failure.signedIn ? (
          <>
            <Button onClick={() => void finish()}>Try again</Button>
            <Button variant="outline" onClick={() => void logout()}>
              Log out
            </Button>
          </>
        ) : (
          <Button asChild>
            <Link to="/login">Back to login</Link>
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
