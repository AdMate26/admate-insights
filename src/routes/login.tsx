import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Log in or sign up — AdMate" }],
  }),
  component: LoginPage,
});

function AuthWordmark() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="AdMate home">
      <img
        src="/brand/mark-light-bg.svg"
        alt=""
        className="h-7 w-7 dark:hidden"
        width={28}
        height={28}
      />
      <img
        src="/brand/mark-violet.svg"
        alt=""
        className="hidden h-7 w-7 dark:block"
        width={28}
        height={28}
      />
      <span className="text-lg tracking-tight text-foreground">
        Ad<strong className="font-bold">Mate</strong>
      </span>
    </Link>
  );
}

/** Google "G" mark for the OAuth-style button (UI only, no OAuth wired). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function LoginPage() {
  // Phase 1 placeholder: combined log in / sign up entry. UI only — no real
  // authentication, Google OAuth, or account creation is wired up yet. The two
  // handlers below acknowledge the click without pretending auth succeeded; when
  // Supabase is added, replace their bodies (e.g. supabase.auth.signInWithOAuth
  // for Google) without changing the page layout.
  function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    toast("Authentication will be connected in the next setup step.");
  }

  function handleGoogle() {
    // Future: supabase.auth.signInWithOAuth({ provider: "google" }) → callback.
    toast("Google sign-in will be available once authentication is connected.");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-subtle">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-5">
        <AuthWordmark />
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg shadow-primary/5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Log in or sign up
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue with your email to access AdMate.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleEmailContinue}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" />
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
            <GoogleMark />
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              ← Back to AdMate
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
