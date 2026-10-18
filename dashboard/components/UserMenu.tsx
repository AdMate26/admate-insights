"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { signOut } from "@/app/(auth)/actions";
import { buttonClass, cx } from "./ui";

// Signed-in email and sign-out. Also tells analytics who this is, so sessions
// can be seen per person (only when NEXT_PUBLIC_POSTHOG_KEY is set).
export function UserMenu({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    if (posthog.__loaded) posthog.identify(userId, { email });
  }, [userId, email]);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
      <span className="min-w-0 truncate text-xs text-muted" title={email}>
        {email}
      </span>
      <form action={signOut} onSubmit={() => posthog.__loaded && posthog.reset()}>
        <button className={cx(buttonClass.quiet, "shrink-0")}>Sign out</button>
      </form>
    </div>
  );
}
