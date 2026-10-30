import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser, type CurrentUser } from "../auth/session";
import { SESSION_COOKIE } from "../auth/cookie";
import { publicOrigin } from "../integration/paths";
import { isTikTokConnectionEnabled, isTikTokUserAllowed } from "./config";
import { TikTokConnectError, type TikTokConnectErrorCode } from "./service";

// Request guard for every TikTok route: off unless enabled (404), signed in
// with a real session (401; demo visitors never), allowed to use TikTok (403:
// the tester allowlist, or anyone signed in during the staging open beta), and
// for changes, sent from AdMate's own site (403).

export const NO_STORE = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };

export function tiktokJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

export function sameOrigin(request: Request): boolean {
  const origin = publicOrigin();
  const site = request.headers.get("sec-fetch-site");
  return !!origin && request.headers.get("origin") === origin && (site === null || site === "same-origin");
}

export async function requireTikTokUser(): Promise<{ user: CurrentUser; sessionToken: string } | Response> {
  if (!isTikTokConnectionEnabled()) return new Response("Not found", { status: 404, headers: NO_STORE });
  const user = await getCurrentUser();
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!user || user.readOnly || !sessionToken) return tiktokJson({ error: "unauthorized" }, 401);
  if (!isTikTokUserAllowed(user.id)) return tiktokJson({ error: "forbidden" }, 403);
  return { user, sessionToken };
}

const STATUS: Record<TikTokConnectErrorCode, number> = {
  oauth_state: 400,
  exchange: 502,
  not_connected: 404,
  reauth_required: 409,
  provider: 502,
  advertiser: 403,
  workspace: 403,
  sample: 403,
  currency: 409,
  busy: 409,
  import_limit: 409,
  report: 502,
  timeout: 504,
  storage: 500,
  consent: 400,
  connect_closed: 403,
  connect_limit: 429,
  beta_full: 403,
  sync_limit: 429,
  account_limit: 409,
};

/** A fixed error code for the browser; never provider text, tokens or stack traces. */
export function tiktokFailure(error: unknown) {
  const code = error instanceof TikTokConnectError ? error.code : "provider";
  return tiktokJson({ error: code }, STATUS[code]);
}
