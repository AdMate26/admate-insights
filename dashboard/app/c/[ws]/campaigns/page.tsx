import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { BegMyAds, Campaigns } from "@/components/v5/views/campaigns";
import { pageLabel } from "@/lib/levels";

export const metadata = { title: "Campaigns" };

// My ads (Beginner) or the campaign › ad set › ad table with Compare.
export default async function CampaignsPage({ params, searchParams }: PageProps<"/c/[ws]/campaigns">) {
  const { ws } = await params;
  const { level, data, ask } = await pageData(ws, searchParams);
  if (!data) return <NoData title={pageLabel(level, "campaigns")} />;
  return (
    <V5Page vm={data.vm} page={level === "beginner" ? "myads" : "campaigns"} askAvailable={ask}>
      <PageHead title={pageLabel(level, "campaigns")} />
      <div className="page">{level === "beginner" ? <BegMyAds /> : <Campaigns />}</div>
    </V5Page>
  );
}
