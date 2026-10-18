import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Shell } from "@/components/Shell";
import { AskPanel } from "@/components/AskPanel";
import { AskAvailabilityProvider } from "@/components/AskAvailability";
import { aiEnabled, ASK_AVAILABLE } from "@/lib/ai/client";
import { getWorkspace } from "@/lib/data/workspaces";

export default async function AccountLayout({ children, params }: LayoutProps<"/c/[ws]">) {
  const { ws } = await params;
  const workspace = await getWorkspace(ws);
  if (!workspace) notFound();
  return (
    <Shell current={ws}>
      {workspace.isSample && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-violet-soft px-4 py-2.5 text-sm md:px-8">
          <span>
            <span className="font-medium">You’re exploring a sample account.</span> {workspace.name} is a made-up skincare brand with a few planted problems for AdMate to find.
          </span>
          <Link href={`/c/${ws}/upload`} className="font-medium text-violet hover:underline">
            Upload your own report →
          </Link>
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
