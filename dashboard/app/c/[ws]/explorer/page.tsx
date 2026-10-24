import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { Explorer } from "@/components/v5/views/explorer";
import { Empty } from "@/components/v5/bits";
import { listSavedViews } from "@/lib/data/settings";

export const metadata = { title: "Explorer" };

// Advanced: every campaign, ad set and ad in one table you shape yourself.
export default async function ExplorerPage({ params, searchParams }: PageProps<"/c/[ws]/explorer">) {
  const { ws } = await params;
  const { data, ask } = await pageData(ws, searchParams);
  if (!data) return <NoData title="Explorer" />;
  return (
    <V5Page vm={data.vm} page="explorer" askAvailable={ask}>
      <PageHead title="Explorer" />
      <div className="page">{data.vm.levels.campaign.length ? <Explorer saved={await listSavedViews()} /> : <Empty title="No campaign spent money in this period" text="Pick another period above." />}</div>
    </V5Page>
  );
}
