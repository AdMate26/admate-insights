import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdMate — AI marketing analyst" },
      {
        name: "description",
        content:
          "AdMate monitors advertising campaigns by objective, finds risks and opportunities, and gives you clear actions through the dashboard and Telegram.",
      },
      { property: "og:title", content: "AdMate — AI marketing analyst" },
      {
        property: "og:description",
        content:
          "Know what is working. Know what to do next. Campaign monitoring for Meta, TikTok and Google Ads.",
      },
    ],
  }),
  component: LandingPage,
});
