import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { loadSampleData } from "@/app/actions";
import { listWorkspaces, loadAnalysis } from "@/lib/data/workspaces";
import { badgeCounts } from "@/lib/analysis/insights";
import { ASK_AVAILABLE } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth/session";
import { ReadOnlyProvider } from "@/lib/integration/read-only";
import { AccountNav } from "./AccountNav";
import { UserMenu } from "./UserMenu";
import { Wordmark } from "./Logo";
import { buttonClass, cx } from "./ui";

// App frame. AdMate is built around one ad account at a time: the sidebar shows
// that account's pages and keeps other accounts
// (e.g. the sample) one click away at the bottom.
export async function Shell({ children, current }: { children: ReactNode; current?: string }) {
  const user = await requireUser();
  // AdMate integration: public demo visitors (not signed in) browse read-only.
  const readOnly = !!user.readOnly;
  const accounts = await listWorkspaces();
  const active = accounts.find((a) => a.id === current);
  // The sample sits last, right above "+ Add an ad account".
  const others = accounts.filter((a) => a.id !== current).sort((a, b) => Number(a.isSample) - Number(b.isSample));
  // Badge counts are for the latest data (the default period).
  const latest = active ? await loadAnalysis(active.id) : null;
  const counts = latest ? badgeCounts(latest) : { actions: 0 };
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-60 md:overflow-y-auto md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          {readOnly ? (
            // The website's landing page is outside this app's basePath, so next/link would point at /app.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/" aria-label="AdMate home">
              <Wordmark size={22} />
            </a>
          ) : (
            <Link href="/" aria-label="AdMate home">
              <Wordmark size={22} />
            </Link>
          )}
        </div>
        {active && (
          <div className="px-4 pb-3">
            <div className="label !text-[10px]">Ad account</div>
            <div className="truncate font-medium">{active.name}</div>
            {(active.industry || active.country) && <div className="truncate text-xs text-muted">{[active.industry, active.country].filter(Boolean).join(" · ")}</div>}
          </div>
        )}
        {active && (
          <Suspense>
            <AccountNav workspaceId={active.id} counts={counts} askAvailable={ASK_AVAILABLE} />
          </Suspense>
        )}
        <div className="mx-3 mt-5 hidden rounded-lg border border-line bg-bg p-3 md:block">
          <div className="text-xs font-medium">How AdMate works</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Every number you see is calculated from your uploaded reports. The AI explains those numbers — it never makes them up. Recommendations are advice: AdMate never
            changes your ad account.
          </p>
        </div>
        <div className="hidden flex-1 md:block" />
        {readOnly ? (
          <div className="space-y-2 border-t border-line px-4 py-4 text-sm">
            <p className="text-xs text-muted">You’re viewing AdMate’s public demo. Sign up free to get your own copy and analyse your own ad reports.</p>
            <a href="/login" className={cx(buttonClass.primary, "w-full justify-center")}>
              Sign in or sign up
            </a>
          </div>
        ) : (
        <>
        <div className="hidden space-y-1 px-2 pb-4 md:block">
          {others.length > 0 && <div className="label px-2 pb-1 pt-4 !text-[10px]">Other accounts</div>}
          {others.map((a) => (
            <Link key={a.id} href={`/c/${a.id}`} className="block truncate rounded-md px-2 py-1.5 text-sm text-muted hover:bg-bg hover:text-fg">
              {a.name}
            </Link>
          ))}
          <Link href="/accounts/new" className="block rounded-md px-2 py-1.5 text-sm text-violet hover:underline">
            + Add an ad account
          </Link>
          <form action={loadSampleData}>
            <button className={cx(buttonClass.quiet, "w-full justify-start")}>{accounts.some((a) => a.isSample) ? "Reset the sample account" : "Explore the sample account"}</button>
          </form>
        </div>
        <div className="border-t border-line px-2 py-2">
          <UserMenu userId={user.id} email={user.email} />
        </div>
        </>
        )}
      </aside>
      <main className="min-w-0 flex-1">
        <ReadOnlyProvider value={readOnly}>{children}</ReadOnlyProvider>
      </main>
    </div>
  );
}
