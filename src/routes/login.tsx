import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Log in — AdMate" }],
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

function LoginPage() {
  // Phase 1 placeholder: no authentication yet. The form is visual only and does
  // not sign anyone in or claim success.
  return (
    <div className="flex min-h-screen flex-col bg-surface-subtle">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-5">
        <AuthWordmark />
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg shadow-primary/5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Log in to your AdMate account.</p>

          <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full">
              Log in
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
