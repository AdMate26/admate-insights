"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui";
import type { AuthState } from "./actions";

const input = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-violet focus:ring-2 focus:ring-violet/20";

export function AuthForm({
  mode,
  action,
  next,
  needsInvite = false,
}: {
  mode: "signin" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  needsInvite?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const signup = mode === "signup";
  return (
    <form action={formAction} className="mt-6 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state?.email} className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={signup ? 8 : undefined}
          autoComplete={signup ? "new-password" : "current-password"}
          className={input}
        />
        {signup && <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>}
      </label>
      {signup && needsInvite && (
        <label className="block">
          <span className="text-sm font-medium">Invite code</span>
          <input name="invite" required autoComplete="off" className={input} />
        </label>
      )}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <button className={buttonClass.primary + " w-full"} disabled={pending}>
        {pending ? (signup ? "Creating your account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        {signup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-violet hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to AdMate?{" "}
            <Link href="/signup" className="text-violet hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
