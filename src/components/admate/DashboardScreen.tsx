import { useSuspenseQuery } from "@tanstack/react-query";

import { AppShell, type ShellMode } from "@/components/admate/AppShell";
import { OverviewView } from "@/components/admate/views/OverviewView";
import { CampaignsView } from "@/components/admate/views/CampaignsView";
import { AlertsView } from "@/components/admate/views/AlertsView";
import { BriefingsView } from "@/components/admate/views/BriefingsView";
import { ReportsView } from "@/components/admate/views/ReportsView";
import { allAnalysisQueryOptions } from "@/lib/analysis-query";
import { resolveBrandPlatform, brandPlatforms } from "@/lib/brands";
import type { DashboardSearch } from "@/lib/dashboard-search";

/**
 * The AdMate dashboard, shared by the public demo (/demo) and the signed-in
 * workspace (/home). The route owns the URL; this component renders the views
 * and asks the route to navigate.
 */
export function DashboardScreen({
  mode,
  search,
  onNavigate,
}: {
  mode: ShellMode;
  search: DashboardSearch;
  onNavigate: (next: DashboardSearch) => void;
}) {
  const { view, brand, platform, objective } = search;
  const { data: analyses } = useSuspenseQuery(allAnalysisQueryOptions(brand));

  const go = (next: Partial<DashboardSearch>) => {
    const nextBrand = next.brand ?? brand;
    // Switching brand (or platform) always re-clamps to a platform this brand
    // has connected, so platform selection can never leave the brand.
    const nextPlatform = resolveBrandPlatform(nextBrand, next.platform ?? platform);
    // Objective is carried only by explicit filter changes. Brand/platform
    // navigation omits it, predictably restoring All objectives.
    onNavigate({ view, ...next, brand: nextBrand, platform: nextPlatform });
  };

  return (
    <AppShell
      mode={mode}
      active={view}
      brand={brand}
      platform={platform}
      onSelectBrand={(b) => go({ view: "campaigns", brand: b })}
    >
      {view === "overview" ? (
        <OverviewView
          analyses={analyses}
          brand={brand}
          onOpenCampaigns={(p) => go({ view: "campaigns", platform: p })}
          onOpenBriefings={() => go({ view: "briefings" })}
        />
      ) : null}
      {view === "campaigns" ? (
        <CampaignsView
          analyses={analyses}
          brand={brand}
          platform={platform}
          platforms={brandPlatforms(brand)}
          objective={objective}
          onSelectObjective={(value) => go(value ? { objective: value } : {})}
          onSelectPlatform={(p) => go({ platform: p })}
        />
      ) : null}
      {view === "alerts" ? (
        <AlertsView
          analyses={analyses}
          onOpenCampaigns={(p) => go({ view: "campaigns", platform: p })}
        />
      ) : null}
      {view === "briefings" ? <BriefingsView brand={brand} /> : null}
      {view === "reports" ? <ReportsView /> : null}
    </AppShell>
  );
}
