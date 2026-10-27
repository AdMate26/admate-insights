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

export function parseTikTokOAuthMetadata(input: unknown): TikTokOAuthMetadata {
  const metadata = metadataSchema.parse(input);
  for (const key of ["authorization_endpoint", "token_endpoint"] as const) {
    const endpoint = new URL(metadata[key]);
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
  if (!response.ok) throw new Error("TikTok token refresh failed");
  return parseTikTokOAuthTokens(await response.json());
}
