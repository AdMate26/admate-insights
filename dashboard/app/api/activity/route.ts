import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/data/workspaces";
import { captureServer, serverAnalyticsOn, touchVisit } from "@/lib/analytics-server";
import { publicOrigin } from "@/lib/integration/paths";

// AdMate integration: signed-in activity for product analytics (lib/analytics-server.ts).
// The dashboard posts {kind: "view" | "leave", path, seconds?} when a page is
// opened or left. Only signed-in people are recorded; demo visitors and
// everyone else get 204 and nothing is sent. Same-origin only.

const PATH = /^\/[A-Za-z0-9/_-]{0,200}$/;
const OVERVIEW = /^\/c\/([A-Za-z0-9_-]+)$/;

function sameOrigin(request: Request): boolean {
  const origin = publicOrigin();
  const site = request.headers.get("sec-fetch-site");
  return !!origin && request.headers.get("origin") === origin && (site === null || site === "same-origin");
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (!serverAnalyticsOn()) return new Response(null, { status: 204 });
  const user = await getCurrentUser();
  if (!user || user.readOnly) return new Response(null, { status: 204 });

  let body: { kind?: unknown; path?: unknown; seconds?: unknown };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const path = typeof body.path === "string" ? body.path : "";
  if ((body.kind !== "view" && body.kind !== "leave") || !PATH.test(path)) return new Response(null, { status: 400 });

  const now = new Date();
  const { visitId, isNew } = await touchVisit(user.id, now);
  // The email is set once per visit, not on every page.
  const email = isNew ? user.email : null;

  if (body.kind === "leave") {
    const seconds = typeof body.seconds === "number" && Number.isFinite(body.seconds) ? Math.min(Math.max(body.seconds, 0), 1800) : null;
    after(() =>
      captureServer({ event: "$pageleave", userId: user.id, email, path, visitId, at: now, properties: seconds === null ? {} : { $prev_pageview_duration: Math.round(seconds * 10) / 10 } }),
    );
    return new Response(null, { status: 204 });
  }

  // An account's Overview is "analysis viewed" (sample or own account; never its name).
  const ws = OVERVIEW.exec(path)?.[1];
  const account = ws ? await getWorkspace(ws) : null;
  after(async () => {
    await captureServer({ event: "$pageview", userId: user.id, email, path, visitId, at: now });
    if (account) await captureServer({ event: "analysis_viewed", userId: user.id, path, visitId, at: now, properties: { account: account.isSample ? "sample" : "own" } });
  });
  return new Response(null, { status: 204 });
}
