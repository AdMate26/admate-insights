import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { redirect, useNavigate } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PROFILE_QUERY_KEY, isOnboardingComplete, profileQueryOptions } from "./profile";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthState = { status: AuthStatus; session: Session | null };

/**
 * Tracks the real Supabase session. Starts in "loading" on both server and
 * client (so SSR markup and hydration agree), then resolves from the persisted
 * session and follows sign-in / sign-out / token-refresh events.
 */
export function useAuthSession(): AuthState & { user: User | null } {
  const [state, setState] = useState<AuthState>({ status: "loading", session: null });

  useEffect(() => {
    let active = true;
    const apply = (session: Session | null) => {
      if (active) setState({ status: session ? "authenticated" : "unauthenticated", session });
    };
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { ...state, user: state.session?.user ?? null };
}

/**
 * Route guard for `beforeLoad` (client-only routes): returns the current
 * session or redirects a logged-out visitor to /login.
 */
export async function requireSession(): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw redirect({ to: "/login" });
  return data.session;
}

export type PostLoginPath = "/home" | "/onboarding";

/** A session could not be established or validated. */
export class SignInError extends Error {
  constructor(message = "Sign-in could not be completed") {
    super(message);
    this.name = "SignInError";
  }
}

/**
 * Finishes any pending sign-in, validates the user with the auth server, reads
 * their own profile, and returns where they belong. Shared by the OAuth
 * callback and the email-code flow so post-login routing lives in one place.
 */
export async function completeSignIn(queryClient: QueryClient): Promise<PostLoginPath> {
  // getSession() waits for the client to finish initialising, which includes
  // picking up tokens from an OAuth / magic-link redirect URL.
  let session = (await supabase.auth.getSession()).data.session;

  // PKCE-style redirect (`?code=`) that was not exchanged automatically.
  if (!session && typeof window !== "undefined") {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error && import.meta.env.DEV) console.warn("[auth] code exchange failed", error);
      session = data.session;
    }
  }
  if (!session) throw new SignInError("No session after sign-in");

  // Don't trust the locally stored session alone: confirm with the auth server.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    if (import.meta.env.DEV) console.warn("[auth] getUser failed", userError);
    throw new SignInError("Session could not be validated");
  }

  const profile = await queryClient.fetchQuery(profileQueryOptions(userData.user.id));
  return isOnboardingComplete(profile.onboarding_status) ? "/home" : "/onboarding";
}

/** Real Supabase logout: ends the session and returns to the public landing page. */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (import.meta.env.DEV) console.warn("[auth] sign-out failed", error);
      toast.error("We couldn't log you out. Please try again.");
      return;
    }
    await navigate({ to: "/", replace: true });
    queryClient.removeQueries({ queryKey: PROFILE_QUERY_KEY });
  };
}
