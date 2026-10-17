/**
 * Server-side identity check for owner-only (live) data — server-only.
 *
 * A bearer token on the request is not authorization by itself: the token is
 * validated by the Supabase Auth server (GET /auth/v1/user), and the resulting
 * user id must equal META_OWNER_USER_ID. Anything else — no token, an invalid
 * or expired token, a different user, missing configuration, or an auth-server
 * failure — yields `null`, which callers treat as "not the owner".
 */

declare const ownerAccessBrand: unique symbol;

/** Proof that the current request was made by the verified owner. */
export type OwnerAccess = { readonly userId: string; readonly [ownerAccessBrand]: true };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OwnerCheckInput = {
  authorization: string | null | undefined;
  ownerUserId: string | null | undefined;
  supabaseUrl: string | null | undefined;
  publishableKey: string | null | undefined;
  fetchImpl?: FetchLike;
};

const AUTH_TIMEOUT_MS = 5000;

export async function checkOwnerAccess(input: OwnerCheckInput): Promise<OwnerAccess | null> {
  const ownerUserId = input.ownerUserId?.trim();
  const supabaseUrl = input.supabaseUrl?.trim().replace(/\/+$/, "");
  const publishableKey = input.publishableKey?.trim();
  if (!ownerUserId || !supabaseUrl || !publishableKey) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(input.authorization?.trim() ?? "");
  const token = match?.[1];
  if (!token || token.split(".").length !== 3) return null;

  try {
    const response = await (input.fetchImpl ?? fetch)(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: unknown };
    if (typeof user.id !== "string" || user.id !== ownerUserId) return null;
    return { userId: user.id } as OwnerAccess;
  } catch {
    return null;
  }
}

function readEnv(name: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  if (fromProcess) return fromProcess;
  // VITE_* values are public and inlined at build time; read them when the
  // runtime environment doesn't expose them. Deliberately NO fallback to the
  // server SUPABASE_URL, which may point at a different project.
  const fromBuild = (import.meta.env as Record<string, unknown>)[name];
  return typeof fromBuild === "string" ? fromBuild : undefined;
}

/** Verify the current server-function request against META_OWNER_USER_ID. */
export async function verifyOwnerAccess(): Promise<OwnerAccess | null> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  return checkOwnerAccess({
    authorization: request?.headers.get("authorization"),
    ownerUserId: process.env["META_OWNER_USER_ID"],
    supabaseUrl: readEnv("VITE_SUPABASE_URL"),
    publishableKey: readEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
  });
}
