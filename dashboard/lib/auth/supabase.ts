// Verifies a Supabase access token with the Supabase Auth server, the same
// check the AdMate website uses for its owner-only data (checkOwnerAccess):
// the token is only trusted after the auth server returns the user it belongs
// to. Used once per sign-in, by the session bridge (app/api/session).

export interface SupabaseUser {
  id: string;
  email: string;
  // How they signed in ("email" or "google"), for sign-up analytics.
  provider?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const AUTH_TIMEOUT_MS = 5000;

export function supabaseConfig(): { url: string; publishableKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

// `authorization` is the request's Authorization header. Anything other than a
// valid, unexpired token for a user with an email yields null. Never throws and
// never logs the token.
export async function verifySupabaseToken(authorization: string | null, fetchImpl: FetchLike = fetch): Promise<SupabaseUser | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const token = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "")?.[1];
  if (!token || token.split(".").length !== 3) return null;
  try {
    const response = await fetchImpl(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: unknown; email?: unknown; app_metadata?: { provider?: unknown } };
    if (typeof user.id !== "string" || !user.id) return null;
    if (typeof user.email !== "string" || !user.email) return null;
    const provider = user.app_metadata?.provider;
    return { id: user.id, email: user.email.trim().toLowerCase(), ...(typeof provider === "string" ? { provider } : {}) };
  } catch {
    return null;
  }
}
