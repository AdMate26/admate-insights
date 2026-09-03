import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AdMate — AI Marketing Analyst for TikTok Ads" },
      {
        name: "description",
        content:
          "AdMate reviews TikTok Ads campaigns and reports what changed, what needs attention, why, and the recommended action.",
      },
      { property: "og:title", content: "AdMate — AI Marketing Analyst for TikTok Ads" },
      {
        property: "og:description",
        content: "Deterministic campaign findings with AI-written explanations and recommended actions.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/start" : "/auth", replace: true });
  },
  component: () => null,
});
