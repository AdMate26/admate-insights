import { redirect } from "next/navigation";
import { FirstBrandDialog } from "@/components/FirstBrandDialog";
import { requireUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/data/workspaces";

export const metadata = { title: "Overview" };

export default async function StartPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const accounts = await listWorkspaces();
  const own = accounts.filter((a) => !a.isSample);
  const target = own[own.length - 1] ?? accounts[0];
  if (target) redirect(`/c/${target.id}`);

  const { brandError } = await searchParams;
  return <FirstBrandDialog error={brandError === "name" || brandError === "industry" ? brandError : undefined} />;
}
