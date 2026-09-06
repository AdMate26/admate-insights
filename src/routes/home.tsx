import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell, type ViewKey } from "@/components/admate/AppShell";
import { OverviewView } from "@/components/admate/views/OverviewView";
import { CampaignsView } from "@/components/admate/views/CampaignsView";
import { AlertsView } from "@/components/admate/views/AlertsView";
import { BriefingsView } from "@/components/admate/views/BriefingsView";
import { ReportsView } from "@/components/admate/views/ReportsView";
import { allAnalysisQueryOptions } from "@/lib/analysis-query";
import { DEFAULT_PLATFORM, isPlatform, type Platform } from "@/lib/platforms";

const VIEWS: ViewKey[] = ["overview", "campaigns", "alerts", "briefings", "reports"];
function isView(v: unknown): v is ViewKey {
  return typeof v === "string" && (VIEWS as string[]).includes(v);
}

export const Route = createFileRoute("/home")({
  validateSearch: (search: Record<string, unknown>): { view: ViewKey; platform: Platform } => ({
    view: isView(search.view) ? search.view : "overview",
    platform: isPlatform(search.platform) ? search.platform : DEFAULT_PLATFORM,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allAnalysisQueryOptions()),
  head: () => ({
    meta: [
      { title: "AdMate — Platform-aware marketing analyst" },
      {
        name: "description",
        content:
          "AdMate judges every campaign on the metric its objective was bought against, across Meta, TikTok and Google.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { view, platform } = Route.useSearch();
  const navigate = useNavigate();
  const { data: analyses } = useSuspenseQuery(allAnalysisQueryOptions());

  const go = (next: Partial<{ view: ViewKey; platform: Platform }>) =>
    navigate({ to: "/home", search: { view, platform, ...next } });

  return (
    <AppShell active={view} platform={platform}>
      {view === "overview" ? (
        <OverviewView
          analyses={analyses}
          onOpenCampaigns={(p) => go({ view: "campaigns", platform: p })}
          onOpenBriefings={() => go({ view: "briefings" })}
        />
      ) : null}
      {view === "campaigns" ? (
        <CampaignsView
          analyses={analyses}
          platform={platform}
          onSelectPlatform={(p) => go({ platform: p })}
        />
      ) : null}
      {view === "alerts" ? (
        <AlertsView analyses={analyses} onOpenCampaigns={(p) => go({ view: "campaigns", platform: p })} />
      ) : null}
      {view === "briefings" ? <BriefingsView /> : null}
      {view === "reports" ? <ReportsView analyses={analyses} /> : null}
    </AppShell>
  );
}
