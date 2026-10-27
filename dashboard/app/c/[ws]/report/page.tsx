import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { PerformanceReport } from "@/components/v5/views/report";

export const metadata = { title: "Performance report" };

// Build a performance report: dates from the picker, chosen metrics, charts and sections.
export default async function ReportPage({ params, searchParams }: PageProps<"/c/[ws]/report">) {
  const { ws } = await params;
  const { data, ask } = await pageData(ws, searchParams);
  if (!data) return <NoData title="Performance report" />;
  return (
    <V5Page vm={data.vm} page="report" askAvailable={ask}>
      <PageHead title="Performance report" />
      <div className="page">
        <PerformanceReport />
      </div>
    </V5Page>
  );
}
