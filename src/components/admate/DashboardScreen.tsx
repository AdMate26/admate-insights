import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { AppShell, type ShellMode } from "@/components/admate/AppShell";
import { LiveConnectionPanel } from "@/components/admate/LiveConnectionPanel";
import { OverviewView } from "@/components/admate/views/OverviewView";
import { CampaignsView } from "@/components/admate/views/CampaignsView";
import { AlertsView } from "@/components/admate/views/AlertsView";
import { BriefingsView } from "@/components/admate/views/BriefingsView";
import { ReportsView } from "@/components/admate/views/ReportsView";
import { allAnalysisQueryOptions, workspaceAccessQueryOptions } from "@/lib/analysis-query";
import { useAuthSession } from "@/lib/auth/session";
import { LIVE_BRANDS, isBrand, resolveBrandPlatform, brandPlatforms } from "@/lib/brands";
import type { DashboardSearch } from "@/lib/dashboard-search";
import { canOfferTelegramControls } from "@/lib/telegram/controls-access";

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

  // Live brands appear only in the workspace, and only once the server confirms
  // this user is the verified owner. The public demo never asks.
  const auth = useAuthSession();
  const userId = auth.user?.id ?? "";
  const access = useQuery({
    ...workspaceAccessQueryOptions(userId),
    enabled: mode === "workspace" && Boolean(userId),
  });
  const liveBrands = LIVE_BRANDS.filter((b) => access.data?.liveBrands.some((id) => id === b.id));
  // Telegram controls are shown only to the server-verified owner (the same
  // answer that unlocks My Account). The Telegram server functions enforce this
  // on their own; this just avoids offering buttons that would be refused.
  const canManageTelegram = canOfferTelegramControls(mode, access.data?.liveBrands);
  const liveConnection = analyses.find((a) => a.source === "meta_live")?.live ?? null;

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
      liveBrands={liveBrands}
      canSendBriefing={canManageTelegram}
    >
      {liveConnection ? <LiveConnectionPanel connection={liveConnection} /> : null}
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
      {view === "briefings" ? (
        isBrand(brand) ? (
          <BriefingsView brand={brand} canManage={canManageTelegram} signedIn={Boolean(userId)} />
        ) : (
          <section className="panel">
            <h2 className="text-sm font-semibold text-foreground">Telegram briefings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Scheduled and on-demand briefings for live Meta data aren&apos;t available yet. They
              currently cover the sample brands only.
            </p>
          </section>
        )
      ) : null}
      {view === "reports" ? <ReportsView /> : null}
    </AppShell>
  );
}
