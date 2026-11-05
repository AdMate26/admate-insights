import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { AppShell, type ShellMode } from "@/components/admate/AppShell";
import { LiveConnectionPanel } from "@/components/admate/LiveConnectionPanel";
import { OverviewView } from "@/components/admate/views/OverviewView";
import { CampaignsView } from "@/components/admate/views/CampaignsView";
import { AlertsView } from "@/components/admate/views/AlertsView";
import { BriefingsView } from "@/components/admate/views/BriefingsView";
import { ReportsView } from "@/components/admate/views/ReportsView";
import { allAnalysisQueryOptions, workspaceAccessQueryOptions } from "@/lib/analysis-query";
import type { AdMateAnalysis } from "@/lib/admate.functions";
import { useAuthSession } from "@/lib/auth/session";
import {
  LIVE_BRANDS,
  isBrand,
  resolveBrandPlatform,
  brandPlatforms,
  type WorkspaceBrandMeta,
} from "@/lib/brands";
import type { DashboardSearch } from "@/lib/dashboard-search";
import { publicDemoQueryOptions } from "@/lib/public-demo-query";
import { canOfferTelegramControls } from "@/lib/telegram/controls-access";

type DashboardProps = {
  search: DashboardSearch;
  onNavigate: (next: DashboardSearch) => void;
};

export function DashboardScreen({ mode, ...props }: DashboardProps & { mode: ShellMode }) {
  return mode === "demo" ? <PublicDemoScreen {...props} /> : <PrivateWorkspaceScreen {...props} />;
}

function PublicDemoScreen(props: DashboardProps) {
  const { data: analyses } = useSuspenseQuery(publicDemoQueryOptions(props.search.brand));
  return <DashboardViews {...props} mode="demo" analyses={analyses} />;
}

function PrivateWorkspaceScreen(props: DashboardProps) {
  const { data: analyses } = useSuspenseQuery(allAnalysisQueryOptions(props.search.brand));
  const auth = useAuthSession();
  const userId = auth.user?.id ?? "";
  const access = useQuery({
    ...workspaceAccessQueryOptions(userId),
    enabled: Boolean(userId),
  });
  const liveBrands = LIVE_BRANDS.filter((b) => access.data?.liveBrands.some((id) => id === b.id));
  const canManageTelegram = canOfferTelegramControls("workspace", access.data?.liveBrands);

  return (
    <DashboardViews
      {...props}
      mode="workspace"
      analyses={analyses}
      liveBrands={liveBrands}
      canManageTelegram={canManageTelegram}
      signedIn={Boolean(userId)}
    />
  );
}

function DashboardViews({
  mode,
  search,
  onNavigate,
  analyses,
  liveBrands = [],
  canManageTelegram = false,
  signedIn = false,
}: DashboardProps & {
  mode: ShellMode;
  analyses: AdMateAnalysis[];
  liveBrands?: readonly WorkspaceBrandMeta[];
  canManageTelegram?: boolean;
  signedIn?: boolean;
}) {
  const { view, brand, platform, objective } = search;
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
          <BriefingsView brand={brand} canManage={canManageTelegram} signedIn={signedIn} />
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
