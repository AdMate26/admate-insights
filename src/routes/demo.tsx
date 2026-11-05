import { createFileRoute, redirect } from "@tanstack/react-router";

// The public sample uses the same Next.js dashboard as signed-in customers.
export const Route = createFileRoute("/demo")({
  beforeLoad: () => {
    throw redirect({ href: "/app/demo", replace: true });
  },
});
