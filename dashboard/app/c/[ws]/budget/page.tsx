import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { Budget } from "@/components/v5/views/budget";
import { campaignDailySpend } from "@/lib/data/view";

export const metadata = { title: "Budget" };

// Advanced: spend by goal, every campaign's share, daily spend and where to add or cut.
export default async function BudgetPage({ params, searchParams }: PageProps<"/c/[ws]/budget">) {
  const { ws } = await params;
  const { data, ask } = await pageData(ws, searchParams);
  if (!data) return <NoData title="Budget" />;
  const daily = await campaignDailySpend(ws, data.vm.from, data.vm.to);
  return (
    <V5Page vm={data.vm} page="budget" askAvailable={ask}>
      <PageHead title="Budget" />
      <div className="page">
        <Budget daily={daily} />
      </div>
    </V5Page>
  );
}
