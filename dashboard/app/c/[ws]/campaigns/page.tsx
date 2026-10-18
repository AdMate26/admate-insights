import { EmptyData } from "@/components/EmptyData";
import { PeriodBar, selectionParams } from "@/components/PeriodBar";
import { Section } from "@/components/v3/bits";
import { CampaignTable, type TableRow } from "@/components/v3/CampaignTable";
import { ItemDrawer } from "@/components/v3/ItemDrawer";
import { one, withParams } from "@/components/v3/links";
import { insightView, type LevelRow } from "@/lib/analysis/insights";
import { loadAnalysis } from "@/lib/data/workspaces";

export const metadata = { title: "Campaigns" };

type Level = "campaign" | "ad_group" | "ad";

// Every campaign, ad set and ad, with its next step. Rows open the same drawer as Actions.
export default async function CampaignsPage({ params, searchParams }: PageProps<"/c/[ws]/campaigns">) {
  const { ws } = await params;
  const sp = await searchParams;
  const a = await loadAnalysis(ws, await selectionParams(searchParams));
  if (!a) return <EmptyData workspaceId={ws} />;
  const v = insightView(a);
  const lv = one(sp, "level");
  const level: Level = lv === "ad_group" || lv === "ad" ? lv : "campaign";
  const withHref = (rows: LevelRow[]): TableRow[] =>
    rows.map((r) => {
      const key = v.keyForEntity({ level: r.level, id: r.id });
      return { ...r, href: key ? withParams(sp, { open: key }) : null };
    });
  const levels = { campaign: withHref(v.levels.campaign), ad_group: withHref(v.levels.ad_group), ad: withHref(v.levels.ad) };
  const levelHref = {
    campaign: withParams(sp, { level: null, open: null }),
    ad_group: withParams(sp, { level: "ad_group", open: null }),
    ad: withParams(sp, { level: "ad", open: null }),
  };
  const openKey = one(sp, "open");

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <p className="label">Campaigns</p>
        <h1 className="mt-1 text-2xl">{a.workspace.name}</h1>
      </div>
      <PeriodBar selection={a.selection} coverage={a.coverage} hasPeriodData={a.totals.spendB > 0 || a.campaigns.some((c) => c.b.impressions > 0)} hasComparisonData={a.hasComparisonData} />
      <Section title="Campaigns" hint={`${v.label} · campaigns that spent in this period`}>
        {v.levels.campaign.length === 0 ? (
          <p className="text-sm text-muted">No campaign spent money in this period.</p>
        ) : (
          <CampaignTable ws={ws} levels={levels} level={level} compareLabel={v.compareLabel} currency={a.workspace.currency} levelHref={levelHref} />
        )}
        {v.levels.ad_group.length === 0 && v.levels.campaign.length > 0 && (
          <p className="mt-2 text-xs text-muted">To see ad sets and ads, export your report at ad set or ad level (Meta: Ads Manager → Ad sets or Ads tab → Export).</p>
        )}
      </Section>
      {openKey && <ItemDrawer a={a} view={v} itemKey={openKey} closeHref={withParams(sp, { open: null })} />}
    </div>
  );
}
