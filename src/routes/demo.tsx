import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Public demo route. The existing dashboard lives at "/home" and is left fully
 * intact (all of its internal links and analysis logic are unchanged); "/demo"
 * simply routes to it, so "View Demo" on the landing page opens the same current
 * AdMate experience.
 */
export const Route = createFileRoute("/demo")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
