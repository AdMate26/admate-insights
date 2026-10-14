import type { AuthError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/** Length of the Supabase email OTP (Auth → Providers → Email → "Email OTP Length"). */
export const OTP_LENGTH = 6;

/** Seconds before another code may be requested (matches Supabase's default limit). */
export const RESEND_COOLDOWN_SECONDS = 60;

export const AUTH_MESSAGES = {
  invalidEmail: "Enter a valid email address.",
  incompleteCode: `Enter the ${OTP_LENGTH}-digit code from your email.`,
  wrongCode: "That code is incorrect or has expired.",
  rateLimited: "Too many attempts. Please wait a minute and try again.",
  sendFailed: "We couldn't send a code. Please try again.",
  emailUnavailable: "Email sign-in isn't available right now. Please try again later.",
  signInFailed: "We couldn't sign you in. Please try again.",
  googleUnavailable: "Google sign-in isn't available yet. Please continue with your email.",
  googleFailed: "We couldn't start Google sign-in. Please try again.",
} as const;

export type AuthResult = { error: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || (error.code ?? "").includes("rate_limit");
}

function logDev(context: string, error: unknown) {
  if (import.meta.env.DEV) console.warn(`[auth] ${context}`, error);
}

/** Where email links and OAuth return to (must be allow-listed in Supabase). */
export function authCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * Sends a one-time code to the email. One flow for new and returning users:
 * Supabase creates the user on first verification, and the database trigger
 * creates their profile.
 */
export async function requestEmailCode(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // If the email template still includes a link, clicking it also works.
        emailRedirectTo: authCallbackUrl(),
      },
    });
    if (!error) return { error: null };
    logDev("signInWithOtp failed", error);
    if (isRateLimited(error)) return { error: AUTH_MESSAGES.rateLimited };
    if (error.code === "email_address_invalid" || error.code === "validation_failed") {
      return { error: AUTH_MESSAGES.invalidEmail };
    }
    if (
      error.code === "otp_disabled" ||
      error.code === "signup_disabled" ||
      error.code === "email_provider_disabled"
    ) {
      return { error: AUTH_MESSAGES.emailUnavailable };
    }
    return { error: AUTH_MESSAGES.sendFailed };
  } catch (error) {
    logDev("signInWithOtp threw", error);
    return { error: AUTH_MESSAGES.sendFailed };
  }
}

/** Verifies the emailed code; on success Supabase stores a real session. */
export async function verifyEmailCode(email: string, token: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (!error && data.session) return { error: null };
    logDev("verifyOtp failed", error);
    if (error && isRateLimited(error)) return { error: AUTH_MESSAGES.rateLimited };
    if (!error || error.code === "otp_expired" || error.status === 400 || error.status === 403) {
      return { error: AUTH_MESSAGES.wrongCode };
    }
    return { error: AUTH_MESSAGES.signInFailed };
  } catch (error) {
    logDev("verifyOtp threw", error);
    return { error: AUTH_MESSAGES.signInFailed };
  }
}

/**
 * Asks the auth server whether the Google provider is enabled, so an
 * unconfigured provider shows a friendly message instead of a raw error page.
 * Returns null when it can't tell (the OAuth attempt then proceeds).
 */
async function isGoogleProviderEnabled(): Promise<boolean | null> {
  const url: unknown = import.meta.env["VITE_SUPABASE_URL"];
  const key: unknown = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (typeof url !== "string" || typeof key !== "string" || !url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const settings = (await res.json()) as { external?: { google?: unknown } };
    const google = settings.external?.google;
    return typeof google === "boolean" ? google : null;
  } catch {
    return null;
  }
}

/**
 * Starts real Supabase Google OAuth. On success the browser leaves for Google
 * and returns to /auth/callback, which finishes sign-in and routes the user.
 */
export async function startGoogleSignIn(): Promise<AuthResult> {
  if ((await isGoogleProviderEnabled()) === false) {
    return { error: AUTH_MESSAGES.googleUnavailable };
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl() },
    });
    if (!error) return { error: null };
    logDev("signInWithOAuth failed", error);
    return { error: AUTH_MESSAGES.googleFailed };
  } catch (error) {
    logDev("signInWithOAuth threw", error);
    return { error: AUTH_MESSAGES.googleFailed };
  }
}

/** Human-readable message for an error returned to the callback URL. */
export function describeRedirectError(code: string | null): string {
  if (code === "access_denied") return "Sign-in was cancelled. You can try again below.";
  return AUTH_MESSAGES.signInFailed;
}

/** Reads `error` from an auth redirect (query string or hash), if any. */
export function readRedirectError(location: Location): string | null {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = query.get("error") ?? hash.get("error");
  if (!code) return null;
  logDev("redirect error", {
    code,
    description: query.get("error_description") ?? hash.get("error_description"),
  });
  return code;
}
