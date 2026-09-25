import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy entry. AdMate signs users in with an email code or Google on /login
 * (no email + password), so the old password form now forwards there.
 */
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/login", replace: true });
  },
});
