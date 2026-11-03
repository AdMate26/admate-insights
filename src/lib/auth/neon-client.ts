/**
 * Neon Auth in the browser (TikTok staging only, see provider.ts).
 *
 * Every call goes to the dashboard's relay at /app/api/auth/* on our own
 * origin, which forwards it to Neon Auth and keeps the session in HttpOnly
 * cookies: page scripts never see the session itself. The only token page
 * code handles is the short-lived one from `getNeonToken`, which goes straight
 * to the dashboard's session bridge in a header (dashboard-bridge.ts).
 */

const AUTH_BASE = "/app/api/auth";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type NeonUser = { id: string; email: string };

export type NeonCodeResult = "ok" | "invalid_email" | "wrong_code" | "rate_limited" | "failed";

function post(path: string, body: unknown, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(`${AUTH_BASE}/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Emails a sign-in code. Neon creates the user when the code is first used. */
export async function sendNeonCode(
  email: string,
  fetchImpl: FetchLike = fetch,
): Promise<NeonCodeResult> {
  try {
    const res = await post(
      "email-otp/send-verification-otp",
      { email, type: "sign-in" },
      fetchImpl,
    );
    if (res.ok) return "ok";
    if (res.status === 429) return "rate_limited";
    if (res.status === 400) return "invalid_email";
    return "failed";
  } catch {
    return "failed";
  }
}

/** Signs in with the emailed code; on success Neon sets the session cookies. */
export async function verifyNeonCode(
  email: string,
  otp: string,
  fetchImpl: FetchLike = fetch,
): Promise<NeonCodeResult> {
  try {
    const res = await post("sign-in/email-otp", { email, otp }, fetchImpl);
    if (res.ok) return "ok";
    if (res.status === 429) return "rate_limited";
    if (res.status === 400 || res.status === 401 || res.status === 403) return "wrong_code";
    return "failed";
  } catch {
    return "failed";
  }
}

/** The signed-in user, confirmed by Neon Auth, or null. Never throws. */
export async function getNeonUser(fetchImpl: FetchLike = fetch): Promise<NeonUser | null> {
  try {
    const res = await fetchImpl(`${AUTH_BASE}/get-session`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      user?: { id?: unknown; email?: unknown };
    } | null;
    const id = body?.user?.id;
    const email = body?.user?.email;
    return typeof id === "string" && id && typeof email === "string" ? { id, email } : null;
  } catch {
    return null;
  }
}

/** A fresh short-lived token for the dashboard's session bridge, or null. */
export async function getNeonToken(fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`${AUTH_BASE}/token`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
    return typeof body?.token === "string" && body.token ? body.token : null;
  } catch {
    return null;
  }
}

/** Ends the Neon session (Neon revokes it and the relay clears the cookies). */
export async function signOutNeon(fetchImpl: FetchLike = fetch): Promise<{ error: unknown }> {
  try {
    const res = await post("sign-out", {}, fetchImpl);
    return { error: res.ok ? null : new Error(`sign-out failed (${res.status})`) };
  } catch (error) {
    return { error };
  }
}
