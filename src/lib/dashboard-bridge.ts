/**
 * Hand-off from the website's Supabase sign-in to the AdMate dashboard (the
 * Next.js app served at /app, see dashboard/INTEGRATION.md).
 *
 * The browser POSTs its current Supabase access token — in a header, same
 * origin, never in a URL — to /app/api/session. The dashboard confirms it with
 * the Supabase Auth server, checks the user is authorised (invite-only) and
 * only then creates its own HttpOnly session cookie. These helpers just call
 * that endpoint and decide where to go next; all authorisation happens there.
 */

export const DASHBOARD_PATH = "/app";
const SESSION_ENDPOINT = `${DASHBOARD_PATH}/api/session`;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type BridgeOutcome =
  | { kind: "dashboard"; href: string }
  | { kind: "login" }
  | { kind: "not_authorized" }
  | { kind: "error" };

/**
 * Only a path inside the dashboard may be a return target (no open redirect):
 * "/app" or "/app/…", no scheme, no "//", no backslashes.
 */
export function safeDashboardPath(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length > 2048) return DASHBOARD_PATH;
  if (!(
    next === DASHBOARD_PATH ||
    next.startsWith(`${DASHBOARD_PATH}/`) ||
    next.startsWith(`${DASHBOARD_PATH}?`)
  )) {
    return DASHBOARD_PATH;
  }
  const hasControlChar = [...next].some((ch) => ch.charCodeAt(0) < 0x20);
  if (next.includes("//") || next.includes("\\") || hasControlChar) return DASHBOARD_PATH;
  return next;
}

/** Ask the dashboard to create its session for the signed-in Supabase user. */
export async function enterDashboard(input: {
  accessToken: string | null | undefined;
  next?: string | null;
  fetchImpl?: FetchLike;
}): Promise<BridgeOutcome> {
  if (!input.accessToken) return { kind: "login" };
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(SESSION_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
  } catch {
    return { kind: "error" };
  }
  if (response.ok) return { kind: "dashboard", href: safeDashboardPath(input.next) };
  if (response.status === 401) return { kind: "login" };
  if (response.status === 403) return { kind: "not_authorized" };
  return { kind: "error" };
}

/**
 * End the dashboard's session in this browser (sign-out, or a new sign-in).
 * Best effort: never throws, so it can't block signing out of Supabase.
 */
export async function endDashboardSession(fetchImpl?: FetchLike): Promise<void> {
  try {
    await (fetchImpl ?? fetch)(SESSION_ENDPOINT, { method: "DELETE", credentials: "same-origin" });
  } catch {
    /* the dashboard may be unreachable; its session still expires on its own */
  }
}

/**
 * Sign out of both applications: the dashboard (/app) first, then Supabase.
 * A dashboard that can't be reached never blocks the Supabase sign-out (its
 * session also ends on its own, and every request there re-checks access).
 * Returns the Supabase error, if any.
 */
export async function signOutEverywhere(deps: {
  endDashboard: () => Promise<void>;
  signOutSupabase: () => Promise<{ error: unknown }>;
}): Promise<{ error: unknown }> {
  try {
    await deps.endDashboard();
  } catch {
    /* never blocks the Supabase sign-out */
  }
  return deps.signOutSupabase();
}
