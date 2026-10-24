import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { V5Provider } from "@/components/v5/ctx";
import { Side } from "@/components/v5/Side";
import { aiEnabled } from "@/lib/ai/client";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { getAlertConfig } from "@/lib/data/alerts";
import { getLevel } from "@/lib/data/settings";
import { getCoverage, getWorkspace, listWorkspaces } from "@/lib/data/workspaces";
import { shortDate } from "@/lib/format";
import { BASE_PATH, websiteUrl } from "@/lib/integration/paths";
import { ReadOnlyProvider } from "@/lib/integration/read-only";
import { DEFAULT_LEVEL } from "@/lib/levels";

// The frame of every ad-account page (prototype v5.1): the sidebar with the account
// and view pickers and the view's menu, the sample-account banner, then the page.
export default async function AccountLayout({ children, params }: LayoutProps<"/c/[ws]">) {
  const { ws } = await params;
  // AdMate integration: someone who is not signed in can only see the public
  // demo; any other account sends them to sign in on the website (e.g. their
  // own bookmark). Writes are refused server-side for read-only visitors.
  const viewer = await getCurrentUser();
  const workspace = await getWorkspace(ws);
  if (!workspace && (!viewer || viewer.readOnly)) redirect(websiteUrl(`/home?next=${encodeURIComponent(`${BASE_PATH}/c/${ws}`)}`));
  const user = await requireUser();
  if (!workspace) notFound();
  const readOnly = !!viewer?.readOnly;
  const [accounts, coverage, saved, alerts] = await Promise.all([listWorkspaces(), getCoverage(ws), getLevel(), getAlertConfig(ws)]);
  const level = saved ?? DEFAULT_LEVEL;
  const end = coverage.dailyTo ?? coverage.maxDate;
  const min = coverage.dailyFrom ?? coverage.minDate;
  return (
    <div className="v5" id="v5root">
      <V5Provider
        value={{
          ws,
          name: workspace.name,
          level,
          cur: workspace.currency,
          end,
          min,
          accounts: accounts.map((a) => ({ id: a.id, name: a.name, industry: a.industry, country: a.country, isSample: a.isSample })),
          isSample: workspace.isSample,
          muted: alerts.muted,
          email: user.email,
          askReady: aiEnabled(),
          readOnly,
        }}
      >
        <ReadOnlyProvider value={readOnly}>
        <div className="frame">
          <Suspense>
            <Side counts={{ actions: 0, alerts: 0 }} answered={!!saved} userId={user.id} />
          </Suspense>
          <main className="main">
            {workspace.isSample && (
              <div className="banner">
                <span>
                  <b>{readOnly ? "AdMate’s public demo." : "Sample account."}</b> {workspace.name} is made up, so you can explore safely.
                  {coverage.maxDate && <> Sample data through {shortDate(coverage.maxDate)}.</>}
                </span>
                {readOnly ? <a href="/login">Sign up free to upload your own report →</a> : <Link href={`/c/${ws}/upload`}>Upload your own report →</Link>}
              </div>
            )}
            <div className="content">{children}</div>
          </main>
        </div>
        </ReadOnlyProvider>
      </V5Provider>
    </div>
  );
}
