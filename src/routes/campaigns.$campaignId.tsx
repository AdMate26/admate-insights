import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The old demo's campaign page. The demo is now the AdMate dashboard's (Project
 * B) at /demo, which has its own campaign views, so old links land there.
 */
export const Route = createFileRoute("/campaigns/$campaignId")({
  beforeLoad: () => {
    throw redirect({ to: "/demo", replace: true });
  },
});
