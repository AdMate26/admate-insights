import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { Geography } from "@/components/v5/views/geography";
import { loadGeography } from "@/lib/data/geography";
import { getWorkspace } from "@/lib/data/workspaces";

export const metadata = { title: "Geography" };

// Where the money goes by location, and how each location did for one goal.
export default async function GeographyPage({ params, searchParams }: PageProps<"/c/[ws]/geography">) {
  const { ws } = await params;
  const { data, ask, sp } = await pageData(ws, searchParams);
  if (!data) return <NoData title="Geography" />;
  const workspace = await getWorkspace(ws);
  const t = typeof sp.t === "string" ? sp.t : undefined;
  const geo = await loadGeography(data.a, !!workspace?.isSample, t);
  return (
    <V5Page vm={data.vm} page="geography" askAvailable={ask}>
      <PageHead title="Geography" />
      <div className="page">
        <Geography geo={geo} />
      </div>
    </V5Page>
  );
}
