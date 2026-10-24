import { NoData } from "@/components/v5/NoData";
import { PageHead } from "@/components/v5/PageHead";
import { V5Page } from "@/components/v5/page";
import { pageData } from "@/components/v5/server";
import { AdvActions, BegTodo, IntOptimize } from "@/components/v5/views/actions";
import { pageLabel } from "@/lib/levels";

export const metadata = { title: "Actions" };

// To-do (Beginner), Optimize (Intermediate) or Actions with bulk decisions (Advanced).
export default async function ActionsPage({ params, searchParams }: PageProps<"/c/[ws]/actions">) {
  const { ws } = await params;
  const { level, data, ask } = await pageData(ws, searchParams);
  if (!data) return <NoData title={pageLabel(level, "actions")} />;
  const page = level === "beginner" ? "todo" : level === "advanced" ? "actions" : "optimize";
  return (
    <V5Page vm={data.vm} page={page} askAvailable={ask}>
      <PageHead title={level === "beginner" ? "Things to do" : pageLabel(level, "actions")} />
      <div className="page">{level === "beginner" ? <BegTodo /> : level === "advanced" ? <AdvActions /> : <IntOptimize />}</div>
    </V5Page>
  );
}
