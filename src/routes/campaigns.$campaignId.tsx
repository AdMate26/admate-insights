import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/campaigns/$campaignId")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
