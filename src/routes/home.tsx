import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell, type ViewKey } from "@/components/admate/AppShell";
import { OverviewView } from "@/components/admate/views/OverviewView";
import { CampaignsView } from "@/components/admate/views/CampaignsView";
import { AlertsView } from "@/components/admate/views/AlertsView";
import { BriefingsView } from "@/components/admate/views/BriefingsView";
import { ReportsView } from "@/components/admate/views/ReportsView";
import { allAnalysisQueryOptions } from "@/lib/analysis-query";
import {
  DEFAULT_BRAND,
  isBrand,
  resolveBrandPlatform,
  brandPlatforms,
  type Brand,
} from "@/lib/brands";
import { type Platform } from "@/lib/platforms";

const VIEWS: ViewKey[] = ["overview", "campaigns", "alerts", "briefings", "reports"];
function isView(v: unknown): v is ViewKey {
  return typeof v === "string" && (VIEWS as string[]).includes(v);
}

type HomeSearch = { view: ViewKey; brand: Brand; platform: Platform };

export const Route = createFileRoute("/home")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const brand = isBrand(search.brand) ? search.brand : DEFAULT_BRAND;
    return {
      // Default landing view is Campaigns for the default/first brand; an
      // explicit ?view=overview (e.g. the "All accounts" nav) still resolves
      // through here, so refresh and direct URLs keep whatever view is set.
      view: isView(search.view) ? search.view : "campaigns",
      brand,
      // Platform is always clamped to one the selected brand has connected.
      platform: resolveBrandPlatform(brand, search.platform),
    };
  },
  loaderDeps: ({ search }) => ({ brand: search.brand }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(allAnalysisQueryOptions(deps.brand)),
  head: () => ({
    meta: [
      { title: "AdMate — Platform-aware marketing analyst" },
      {
        name: "description",
        content:
          "AdMate judges every campaign on the metric its objective was bought against, across each brand's connected platforms.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { view, brand, platform } = Route.useSearch();
  const navigate = useNavigate();
  const { data: analyses } = useSuspenseQuery(allAnalysisQueryOptions(brand));

  const go = (next: Partial<HomeSearch>) => {
    const nextBrand = next.brand ?? brand;
    // Switching brand (or platform) always re-clamps to a platform this brand
    // has connected, so platform selection can never leave the brand.
    const nextPlatform = resolveBrandPlatform(nextBrand, next.platform ?? platform);
    navigate({
      to: "/home",
      search: { view, ...next, brand: nextBrand, platform: nextPlatform },
    });
  };

  return (
    <AppShell
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
          onSelectPlatform={(p) => go({ platform: p })}
        />
      ) : null}
      {view === "alerts" ? (
        <AlertsView analyses={analyses} onOpenCampaigns={(p) => go({ view: "campaigns", platform: p })} />
      ) : null}
      {view === "briefings" ? <BriefingsView brand={brand} /> : null}
      {view === "reports" ? <ReportsView analyses={analyses} /> : null}
    </AppShell>
  );
}
