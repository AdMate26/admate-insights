import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Sign-up and log-in are one flow on /login (email code or Google), so the old
 * separate sign-up form now forwards there.
 */
export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/login", replace: true });
  },
});
