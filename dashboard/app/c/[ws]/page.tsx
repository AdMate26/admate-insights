import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { AdvOverview, BegHome, IntOverview } from "@/components/v5/views/overview";
import { pageLabel } from "@/lib/levels";

export const metadata = { title: "Overview" };

// Home (Beginner), Overview (Intermediate) or the dense Overview (Advanced).
export default async function OverviewPage({ params, searchParams }: PageProps<"/c/[ws]">) {
  const { ws } = await params;
  const { level, data, ask } = await pageData(ws, searchParams);
  if (!data) return <NoData title={pageLabel(level, "overview")} />;
  const page = level === "beginner" ? "home" : "overview";
  return (
    <V5Page vm={data.vm} page={page} askAvailable={ask}>
      <PageHead title={pageLabel(level, "overview")} />
      <div className="page">{level === "beginner" ? <BegHome /> : level === "advanced" ? <AdvOverview alerts={data.alerts} /> : <IntOverview />}</div>
    </V5Page>
  );
}
