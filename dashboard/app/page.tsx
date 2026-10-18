import { redirect } from "next/navigation";
import { loadSampleData } from "./actions";
import { Shell } from "@/components/Shell";
import { AppIcon } from "@/components/Logo";
import { ButtonLink, buttonClass } from "@/components/ui";
import { listWorkspaces } from "@/lib/data/workspaces";

export const metadata = { title: "Welcome" };

// AdMate opens on your ad account. With no account yet, it explains what it
// does and offers the two ways in: your own export, or the sample account.
export default async function StartPage() {
  const accounts = await listWorkspaces();
  const mine = accounts.filter((a) => !a.isSample);
  const target = mine[mine.length - 1] ?? accounts[0];
  if (target) redirect(`/c/${target.id}`);

  return (
    <Shell>
      <div className="mx-auto flex max-w-xl flex-col items-start gap-6 px-6 py-20">
        <AppIcon size={56} />
        <div>
          <p className="label">AdMate · AI marketing analyst</p>
          <h1 className="mt-2 text-4xl">Know what needs your attention in your ads — and what to do about it.</h1>
          <p className="mt-3 text-muted">
            Upload an export from Meta, TikTok, Google Ads or LinkedIn. AdMate compares it with the period before, judges each campaign by its own goal, and tells you what to
            look at first, why, and what to do next — with the numbers behind every suggestion.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/accounts/new">Add my ad account</ButtonLink>
          <form action={loadSampleData}>
            <button className={buttonClass.ghost}>Explore a sample account</button>
          </form>
        </div>
        <p className="text-xs text-muted">Your reports are stored privately in your AdMate account. AdMate never connects to or changes your ad accounts.</p>
      </div>
    </Shell>
  );
}
