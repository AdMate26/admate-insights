import { createFileRoute } from "@tanstack/react-router";

import { analyticsAvailable, openAnalyticsSettings } from "@/lib/analytics/posthog";

import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdMate — AI marketing analyst" },
      {
        name: "description",
        content:
          "Upload your ad reports, see what changed, and review recommendations based on your campaign goals.",
      },
      { property: "og:title", content: "AdMate — AI marketing analyst" },
      {
        property: "og:description",
        content: "Turn your ad reports into clear insights and a next step you can act on.",
      },
    ],
  }),
  component: () => (
    <LandingPage onCookieSettings={analyticsAvailable() ? openAnalyticsSettings : undefined} />
  ),
});
