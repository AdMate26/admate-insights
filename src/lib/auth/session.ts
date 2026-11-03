import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { redirect, useNavigate } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { identifyUser, resetAnalytics, signInMethod, track } from "@/lib/analytics/posthog";
import { endDashboardSession, signOutEverywhere } from "@/lib/dashboard-bridge";
import { getNeonToken, getNeonUser, signOutNeon } from "./neon-client";
import { PROFILE_QUERY_KEY, profileQueryOptions } from "./profile";
import { usesNeonAuth } from "./provider";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** What the screens need of the signed-in user, from Supabase or Neon Auth. */
export type AppUser = Pick<User, "id"> & { email?: string | null };

/** A confirmed sign-in. With Neon Auth (TikTok staging) the session itself stays in HttpOnly cookies. */
export type AppSession = { user: AppUser };

type AuthState = { status: AuthStatus; session: Session | null; neonUser?: AppUser | null };

/**
 * Tracks the real Supabase session. Starts in "loading" on both server and
 * client (so SSR markup and hydration agree), then resolves from the persisted
 * session and follows sign-in / sign-out / token-refresh events.
 */
export function useAuthSession(): AuthState & { user: AppUser | null } {
  const [state, setState] = useState<AuthState>({ status: "loading", session: null });

  useEffect(() => {
    let active = true;
    if (usesNeonAuth()) {
      void getNeonUser().then((user) => {
        if (active)
          setState({
            status: user ? "authenticated" : "unauthenticated",
            session: null,
            neonUser: user,
          });
      });
      return () => {
        active = false;
      };
    }
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

  return { ...state, user: state.neonUser ?? state.session?.user ?? null };
}

/**
 * Route guard for `beforeLoad` (client-only routes): returns the current
 * session or redirects a logged-out visitor to /login.
 */
export async function requireSession(): Promise<AppSession> {
  if (usesNeonAuth()) {
    const user = await getNeonUser();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw redirect({ to: "/login" });
  return data.session;
}

/** Where to go after sign-in. */
export type PostLoginTarget =
  { to: "/home"; search?: { brand: "my_account" } } | { to: "/onboarding" };

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
export async function completeSignIn(queryClient: QueryClient): Promise<PostLoginTarget> {
  // A new sign-in never inherits a dashboard session left in this browser by an
  // earlier user; /home creates a fresh one for this user if they're admitted.
  await endDashboardSession();

  if (usesNeonAuth()) {
    // Neon Auth confirms the session from its HttpOnly cookies. There is no
    // Supabase profile; the dashboard's session bridge admits the user.
    const user = await getNeonUser();
    if (!user) throw new SignInError("No session after sign-in");
    identifyUser(user.id, user.email);
    track("login_completed", { method: "email_code" });
    return { to: "/home" };
  }

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

  // The user's own profile must exist (a missing or unreadable profile is shown
  // as an account error, never skipped).
  await queryClient.fetchQuery(profileQueryOptions(userData.user.id));

  // Analytics (only if the visitor allowed it): the Supabase user ID and email.
  identifyUser(userData.user.id, userData.user.email);
  track("login_completed", { method: signInMethod(userData.user.app_metadata?.provider) });

  // Open registration (submission MVP): every verified user goes straight to
  // their own dashboard; /home hands the sign-in to it. The unfinished Early
  // Access setup is skipped.
  return { to: "/home" };
}

/**
 * The current sign-in's access token for the dashboard's session bridge, or
 * null when signed out: Supabase's session token, or a fresh short-lived Neon
 * Auth token.
 */
export async function currentAccessToken(): Promise<string | null> {
  if (usesNeonAuth()) return getNeonToken();
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  return data.session?.access_token ?? null;
}

/** Real Supabase logout: ends the session and returns to the public landing page. */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async function logout() {
    // End the dashboard (/app) session first, then the Supabase session.
    const { error } = await signOutEverywhere({
      endDashboard: () => endDashboardSession(),
      signOutSupabase: () => (usesNeonAuth() ? signOutNeon() : supabase.auth.signOut()),
    });
    if (error) {
      if (import.meta.env.DEV) console.warn("[auth] sign-out failed", error);
      toast.error("We couldn't log you out. Please try again.");
      return;
    }
    resetAnalytics();
    await navigate({ to: "/", replace: true });
    queryClient.removeQueries({ queryKey: PROFILE_QUERY_KEY });
    // Drop analyses (including the owner's live data) and access answers so
    // nothing from this session is reused by the next sign-in in this browser.
    queryClient.removeQueries({ queryKey: ["admate"] });
  };
}
