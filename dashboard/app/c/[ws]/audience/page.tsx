import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { AudCreatives, AudienceInsight } from "@/components/v5/views/audience";
import { loadAudience } from "@/lib/data/audience";
import { getWorkspace } from "@/lib/data/workspaces";
import { pageLabel } from "@/lib/levels";

export const metadata = { title: "Audience insight" };

// Audiences & creatives (Intermediate) or Audience insight with index and z-score (Advanced).
export default async function AudiencePage({ params, searchParams }: PageProps<"/c/[ws]/audience">) {
  const { ws } = await params;
  const { level, data, ask, sp } = await pageData(ws, searchParams);
  if (!data) return <NoData title={pageLabel(level, "audience")} />;
  const workspace = await getWorkspace(ws);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const aud = await loadAudience(data.a, !!workspace?.isSample, one("t"), one("bd"));
  return (
    <V5Page vm={data.vm} page={level === "advanced" ? "audience" : "audcre"} askAvailable={ask}>
      <PageHead title={level === "advanced" ? "Audience insight" : pageLabel(level, "audience")} />
      <div className="page">
        {level === "advanced" ? (
          <section className="section">
            <AudienceInsight aud={aud} />
          </section>
        ) : (
          <AudCreatives aud={aud} />
        )}
      </div>
    </V5Page>
  );
}
