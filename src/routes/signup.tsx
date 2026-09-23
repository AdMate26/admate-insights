import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Start Early Access — AdMate" }],
  }),
  component: SignupPage,
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

function SignupPage() {
  // Phase 1 placeholder: no account creation and no payment yet. The form is
  // visual only and must not claim that signup or payment succeeded.
  return (
    <div className="flex min-h-screen flex-col bg-surface-subtle">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-5">
        <AuthWordmark />
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-lg shadow-primary/5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Start your AdMate Early Access
          </h1>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-accent px-4 py-3">
            <span className="text-sm font-medium text-foreground">Early Access</span>
            <span className="text-lg font-bold text-primary">$5</span>
          </div>

          <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" type="text" autoComplete="name" placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
