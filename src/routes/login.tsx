import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout, AuthPending, GoogleMark } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTH_MESSAGES,
  OTP_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  isValidEmail,
  normalizeEmail,
  requestEmailCode,
  startGoogleSignIn,
  verifyEmailCode,
} from "@/lib/auth/methods";

export const Route = createFileRoute("/login")({
  // Session lives in the browser; resolve it on the client only.
  ssr: false,
  beforeLoad: async () => {
    // Already signed in → let the callback route pick onboarding vs workspace.
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/auth/callback", replace: true });
  },
  head: () => ({
    meta: [{ title: "Log in or sign up — AdMate" }],
  }),
  pendingComponent: () => <AuthPending />,
  component: LoginPage,
});

type Step = "email" | "code";
type Busy = null | "sending" | "resending" | "verifying" | "google";

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(takeEmailDraft);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Both sign-in methods require accepting the Terms and Privacy Policy first.
  const [accepted, setAccepted] = useState(false);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!accepted) {
      setError(AUTH_MESSAGES.termsRequired);
      return;
    }
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError(AUTH_MESSAGES.invalidEmail);
      return;
    }
    setBusy("sending");
    setError(null);
    const result = await requestEmailCode(normalized);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEmail(normalized);
    setCode("");
    setStep("code");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function verify(token: string) {
    if (busy) return;
    if (token.length !== OTP_LENGTH) {
      setError(AUTH_MESSAGES.incompleteCode);
      return;
    }
    setBusy("verifying");
    setError(null);
    const result = await verifyEmailCode(email, token);
    if (result.error) {
      setBusy(null);
      setCode("");
      setError(result.error);
      return;
    }
    // A real Supabase session now exists; the callback route reads the
    // profile and sends the user to onboarding or their workspace.
    await navigate({ to: "/auth/callback", replace: true });
  }

  async function handleResend() {
    if (busy || cooldown > 0) return;
    setBusy("resending");
    setError(null);
    const result = await requestEmailCode(email);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    toast.success("We sent you a new code.");
  }

  function handleDifferentEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setBusy(null);
  }

  async function handleGoogle() {
    if (busy) return;
    if (!accepted) {
      setError(AUTH_MESSAGES.termsRequired);
      return;
    }
    setBusy("google");
    setError(null);
    const result = await startGoogleSignIn();
    // On success the browser is already leaving for Google; keep the busy state.
    if (result.error) {
      setBusy(null);
      setError(result.error);
    }
  }

  return (
    <AuthLayout>
      {step === "email" ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Log in or sign up
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue with your email to access AdMate.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleEmailContinue} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                disabled={busy !== null}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "auth-error" : undefined}
              />
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="accept-terms"
                className="mt-0.5"
                checked={accepted}
                onCheckedChange={(value) => {
                  setAccepted(value === true);
                  if (error === AUTH_MESSAGES.termsRequired) setError(null);
                }}
                disabled={busy !== null}
                aria-invalid={error === AUTH_MESSAGES.termsRequired ? true : undefined}
              />
              <Label
                htmlFor="accept-terms"
                className="text-sm font-normal leading-snug text-muted-foreground"
              >
                I accept AdMate&apos;s{" "}
                <LegalLink to="/terms" email={email}>
                  Terms of Service
                </LegalLink>{" "}
                and{" "}
                <LegalLink to="/privacy" email={email}>
                  Privacy Policy
                </LegalLink>
              </Label>
            </div>
            {error ? <AuthError message={error} /> : null}
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "sending" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" /> Sending code…
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={busy !== null}
          >
            {busy === "google" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" /> Redirecting to Google…
              </>
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Check your email</h1>
          <p className="mt-1 text-sm text-muted-foreground">We sent a verification code to:</p>
          <p className="mt-0.5 break-all text-sm font-medium text-foreground">{email}</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify(code);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="otp">Verification code</Label>
              <InputOTP
                id="otp"
                maxLength={OTP_LENGTH}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (error) setError(null);
                }}
                onComplete={(value: string) => void verify(value)}
                disabled={busy === "verifying"}
                autoFocus
                autoComplete="one-time-code"
                containerClassName="justify-between"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "auth-error" : undefined}
              >
                <InputOTPGroup className="w-full justify-between gap-2">
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-11 w-11 rounded-md border font-mono text-base first:rounded-md last:rounded-md"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error ? <AuthError message={error} /> : null}
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "verifying" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" /> Verifying…
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </form>

          <div className="mt-4 flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleResend}
              disabled={busy !== null || cooldown > 0}
            >
              {busy === "resending"
                ? "Sending…"
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleDifferentEmail}
              disabled={busy === "verifying"}
            >
              Use a different email
            </Button>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          ← Back to AdMate
        </Link>
      </p>
    </AuthLayout>
  );
}

// The typed email survives a visit to /terms or /privacy (same tab, "Back to
// login"). Session storage only; it may be unavailable, so failures are ignored.
const EMAIL_DRAFT_KEY = "admate-login-email";

function takeEmailDraft(): string {
  try {
    const draft = sessionStorage.getItem(EMAIL_DRAFT_KEY) ?? "";
    sessionStorage.removeItem(EMAIL_DRAFT_KEY);
    return draft;
  } catch {
    return "";
  }
}

function LegalLink({
  to,
  email,
  children,
}: {
  to: "/terms" | "/privacy";
  email: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      search={{ from: "login" }}
      onClick={() => {
        try {
          if (email.trim()) sessionStorage.setItem(EMAIL_DRAFT_KEY, email);
        } catch {
          // Storage unavailable: the email is simply not restored.
        }
      }}
      className="font-medium text-foreground underline underline-offset-2"
    >
      {children}
    </Link>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <p id="auth-error" role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
