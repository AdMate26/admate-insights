import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BriefingsView } from "@/components/admate/views/BriefingsView";
import { AccountErrorState } from "@/components/auth/AccountErrorState";
import { AuthPending } from "@/components/auth/AuthLayout";
import { workspaceAccessQueryOptions } from "@/lib/analysis-query";
import { requireSession, useAuthSession } from "@/lib/auth/session";
import { BRANDS, DEFAULT_BRAND, type Brand } from "@/lib/brands";

/**
 * /telegram — the owner's existing Telegram briefing settings (Preview, Send
 * Now, schedules), unchanged. They used to live inside the old /home dashboard,
 * which now opens the AdMate dashboard instead; this page keeps them reachable.
 *
 * Owner only: the screen is shown when the server confirms the owner, and every
 * Telegram server function re-checks the owner itself (PR #30).
 */
export const Route = createFileRoute("/telegram")({
  ssr: false,
  beforeLoad: async () => {
    await requireSession();
  },
  head: () => ({ meta: [{ title: "Telegram briefings — AdMate" }] }),
  pendingComponent: () => <AuthPending />,
  errorComponent: ({ error, reset }) => <AccountErrorState error={error} reset={reset} />,
  component: TelegramSettings,
});

function TelegramSettings() {
  const auth = useAuthSession();
  const userId = auth.user?.id ?? "";
  const access = useQuery({ ...workspaceAccessQueryOptions(userId), enabled: Boolean(userId) });
  const isOwner = Boolean(access.data?.liveBrands.includes("my_account"));
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);

  if (auth.status === "loading" || (userId && access.isPending)) return <AuthPending />;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <p className="mb-4 text-sm">
        <a href="/app" className="text-muted-foreground hover:text-foreground">
          ← Back to AdMate
        </a>
      </p>
      {isOwner ? (
        <>
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Briefing brand">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === brand}
                className={b.id === brand ? "button-secondary" : "button-quiet"}
                onClick={() => setBrand(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <BriefingsView brand={brand} canManage signedIn />
        </>
      ) : (
        <section className="panel">
          <h1 className="panel-title">Telegram briefings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Telegram briefing settings are available to the AdMate owner account.
          </p>
        </section>
      )}
    </main>
  );
}
