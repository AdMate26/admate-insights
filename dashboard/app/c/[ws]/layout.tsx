import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Shell } from "@/components/Shell";
import { AskPanel } from "@/components/AskPanel";
import { AskAvailabilityProvider } from "@/components/AskAvailability";
import { aiEnabled, ASK_AVAILABLE } from "@/lib/ai/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCoverage, getWorkspace } from "@/lib/data/workspaces";
import { BASE_PATH, websiteUrl } from "@/lib/integration/paths";
import { shortDate } from "@/lib/format";

export default async function AccountLayout({ children, params }: LayoutProps<"/c/[ws]">) {
  const { ws } = await params;
  const workspace = await getWorkspace(ws);
  // AdMate integration: someone who is not signed in can only see the public
  // demo; any other account sends them to sign in (e.g. their own bookmark).
  const viewer = await getCurrentUser();
  if (!workspace && (!viewer || viewer.readOnly)) redirect(websiteUrl(`/home?next=${encodeURIComponent(`${BASE_PATH}/c/${ws}`)}`));
  if (!workspace) notFound();
  const readOnly = !!viewer?.readOnly;
  // The sample's reference date ("Sample data through …").
  const sampleThrough = workspace.isSample ? (await getCoverage(ws)).maxDate : null;
  return (
    <Shell current={ws}>
      {workspace.isSample && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-violet-soft px-4 py-2.5 text-sm md:px-8">
          <span>
            <span className="font-medium">{readOnly ? "You’re exploring AdMate’s public demo." : "You’re exploring a sample account."}</span> {workspace.name} is a made-up skincare brand with a few planted problems for AdMate to find.
            {sampleThrough && <span className="text-muted"> Sample data through {shortDate(sampleThrough)}.</span>}
          </span>
          {readOnly ? (
            <a href="/login" className="font-medium text-violet hover:underline">
              Sign up free to upload your own report →
            </a>
          ) : (
            <Link href={`/c/${ws}/upload`} className="font-medium text-violet hover:underline">
              Upload your own report →
            </Link>
          )}
        </div>
      )}
      <AskAvailabilityProvider available={ASK_AVAILABLE && aiEnabled()}>
        <div className="px-4 py-6 md:px-8">{children}</div>
      </AskAvailabilityProvider>
      {/* Hidden entirely until Ask AdMate is switched on (ADMATE_ASK_ENABLED). */}
      {ASK_AVAILABLE && (
        <Suspense>
          <AskPanel workspaceId={ws} accountName={workspace.name} enabled={aiEnabled()} available={ASK_AVAILABLE} />
        </Suspense>
      )}
    </Shell>
  );
}
