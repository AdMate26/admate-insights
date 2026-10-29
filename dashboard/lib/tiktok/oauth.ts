import "server-only";
import { z } from "zod";
import type { TikTokOAuthConfig } from "./config";

const metadataSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  registration_endpoint: z.string().url().optional(),
  revocation_endpoint: z.string().url().optional(),
  code_challenge_methods_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  scopes_supported: z.array(z.string()).optional(),
});
export type TikTokOAuthMetadata = z.infer<typeof metadataSchema>;

/** A failed OAuth call. `code` is a fixed label, never provider text or tokens. */
export class TikTokOAuthError extends Error {
  constructor(public readonly code: "invalid_grant" | "refresh_failed", message: string) {
    super(message);
    this.name = "TikTokOAuthError";
  }
}

export function parseTikTokOAuthMetadata(input: unknown): TikTokOAuthMetadata {
  const metadata = metadataSchema.parse(input);
  for (const key of ["authorization_endpoint", "token_endpoint", "revocation_endpoint"] as const) {
    const value = metadata[key];
    if (!value) continue;
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "business-api.tiktok.com" ||
        endpoint.username || endpoint.password) {
      throw new Error("Untrusted TikTok OAuth endpoint");
    }
  }
  if (!metadata.code_challenge_methods_supported.includes("S256") ||
      !metadata.grant_types_supported.includes("authorization_code") ||
      (metadata.token_endpoint_auth_methods_supported &&
       !metadata.token_endpoint_auth_methods_supported.includes("none"))) {
    throw new Error("TikTok OAuth metadata is not compatible with public-client PKCE");
  }
  if (metadata.scopes_supported && !metadata.scopes_supported.includes("mcp:tt4b")) {
    throw new Error("TikTok OAuth scope is unavailable");
  }
  return metadata;
}

export function buildTikTokAuthorizationUrl(args: {
  metadata: TikTokOAuthMetadata;
  config: TikTokOAuthConfig;
  state: string;
  challenge: string;
}): string {
  if (!args.state || !args.challenge) throw new Error("Missing PKCE parameters");
  const url = new URL(args.metadata.authorization_endpoint);
  url.search = "";
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.config.clientId);
  url.searchParams.set("redirect_uri", args.config.redirectUri);
  url.searchParams.set("scope", args.config.scope);
  url.searchParams.set("resource", args.config.server);
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token_expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
});

export type TikTokOAuthTokens = z.infer<typeof tokenSchema>;

export function parseTikTokOAuthTokens(input: unknown): TikTokOAuthTokens {
  const token = tokenSchema.parse(input);
  if (token.token_type.toLowerCase() !== "bearer") throw new Error("Unsupported token type");
  if (token.scope && !token.scope.split(/\s+/).includes("mcp:tt4b")) {
    throw new Error("TikTok MCP scope was not granted");
  }
  return token;
}

export async function exchangeTikTokOAuthCode(args: {
  metadata: TikTokOAuthMetadata;
  config: TikTokOAuthConfig;
  code: string;
  verifier: string;
  fetcher?: typeof fetch;
}): Promise<TikTokOAuthTokens> {
  if (!args.code || !args.verifier) throw new Error("Missing authorization code or verifier");
  const fetcher = args.fetcher ?? fetch;
  const response = await fetcher(args.metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: args.config.clientId,
      code: args.code,
      code_verifier: args.verifier,
      redirect_uri: args.config.redirectUri,
      resource: args.config.server,
    }),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("TikTok OAuth exchange failed");
  return parseTikTokOAuthTokens(await response.json());
}

export async function refreshTikTokOAuthTokens(args: {
  metadata: TikTokOAuthMetadata;
  config: TikTokOAuthConfig;
  refreshToken: string;
  fetcher?: typeof fetch;
}): Promise<TikTokOAuthTokens> {
  if (!args.refreshToken) throw new Error("Missing TikTok refresh token");
  const response = await (args.fetcher ?? fetch)(args.metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: args.config.clientId,
      refresh_token: args.refreshToken,
      resource: args.config.server,
    }),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    const code = tikTokOAuthErrorCode(await response.json().catch(() => null));
    throw new TikTokOAuthError(code === "invalid_grant" ? "invalid_grant" : "refresh_failed", "TikTok token refresh failed");
  }
  return parseTikTokOAuthTokens(await response.json());
}

const metadataCache = new Map<string, { at: number; metadata: TikTokOAuthMetadata }>();

/**
 * Discovers the OAuth endpoints for one MCP server path (tokens are bound to
 * that path). The token and revocation endpoints must live under the same
 * server's /oauth/ path. Cached for an hour per server.
 */
export async function fetchTikTokOAuthMetadata(
  server: TikTokOAuthConfig["server"],
  fetcher: typeof fetch = fetch,
): Promise<TikTokOAuthMetadata> {
  const cached = metadataCache.get(server);
  if (cached && Date.now() - cached.at < 3_600_000) return cached.metadata;
  const response = await fetcher(`${server}/oauth/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("TikTok OAuth discovery failed");
  const metadata = parseTikTokOAuthMetadata(await response.json());
  const base = `${server}/oauth/`;
  for (const value of [metadata.token_endpoint, metadata.revocation_endpoint]) {
    if (value && !value.startsWith(base)) throw new Error("TikTok OAuth endpoint is not bound to the MCP server");
  }
  metadataCache.set(server, { at: Date.now(), metadata });
  return metadata;
}

/** Best-effort revocation (idempotent at TikTok). Never throws. */
export async function revokeTikTokToken(args: {
  metadata: TikTokOAuthMetadata;
  token: string;
  hint: "access_token" | "refresh_token";
  fetcher?: typeof fetch;
}): Promise<boolean> {
  if (!args.metadata.revocation_endpoint || !args.token) return false;
  try {
    const response = await (args.fetcher ?? fetch)(args.metadata.revocation_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: args.token, token_type_hint: args.hint }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** TikTok's error code from a failed token response (e.g. invalid_grant), or null. */
export function tikTokOAuthErrorCode(body: unknown): string | null {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? ((body as { error: string }).error.slice(0, 40))
    : null;
}
