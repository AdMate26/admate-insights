import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/data/workspaces";
import { Shell } from "@/components/Shell";
import { isOpenBeta } from "@/lib/tiktok/beta";
import { isTikTokUserAllowed } from "@/lib/tiktok/config";
import { tikTokConnectionStatus } from "@/lib/tiktok/service";
import { TikTokConnect } from "./ui";

export const metadata = { title: "Connect TikTok Ads" };

// AdMate integration: TikTok for Business connection (testing only). Hidden
// (404) unless TIKTOK_CONNECT_ENABLED and the person may use TikTok: the tester
// allowlist, or anyone signed in during the staging open beta (who first sees
// the beta notice).
export default async function ConnectTikTokPage({ searchParams }: PageProps<"/connect/tiktok">) {
  const user = await requireUser();
  if (user.readOnly || !isTikTokUserAllowed(user.id)) notFound();
  const [status, accounts, sp] = await Promise.all([tikTokConnectionStatus(user.id), listWorkspaces(), searchParams]);
  const result = typeof sp.result === "string" && /^[a-z_]{1,30}$/.test(sp.result) ? sp.result : null;
  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Connect TikTok Ads</h1>
        <p className="mt-2 text-sm text-muted">
          Read-only: AdMate reads your advertiser accounts and reports. It never creates, edits or pauses ads, and never changes
          budgets. TikTok&apos;s authorization lasts 30 days; after that you reconnect.
        </p>
        <TikTokConnect status={status} result={result} accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, isSample: a.isSample }))} beta={isOpenBeta()} />
      </div>
    </Shell>
  );
}
