import { createFileRoute } from "@tanstack/react-router";

import { handleCronRequest } from "@/lib/telegram/cron-endpoint";

/** GET|POST /api/cron/run-schedules — see src/lib/telegram/cron-endpoint.ts. */
export const Route = createFileRoute("/api/cron/run-schedules")({
  server: {
    handlers: {
      GET: ({ request }) => handleCronRequest(request),
      POST: ({ request }) => handleCronRequest(request),
    },
  },
});
