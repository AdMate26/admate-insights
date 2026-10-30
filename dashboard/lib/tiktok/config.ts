import "server-only";

/**
 * TikTok for Business MCP OAuth configuration.
 * Off by default: every TikTok route answers 404 unless TIKTOK_CONNECT_ENABLED
 * is "true", and never on a Vercel Production deployment.
 *
 * Who may connect (tiktokAccessMode):
 *   - "allowlist" (default): only Supabase user IDs listed in
 *     TIKTOK_CONNECT_ALLOWED_USER_IDS (an empty list admits nobody).
 *   - "open-beta": anyone signed in with a verified email, for the self-service
 *     staging beta. Only with TIKTOK_CONNECT_ACCESS=open-beta AND a staging
 *     public origin (*.vercel.app or localhost); otherwise it falls back to the
 *     allowlist. Beta switches and limits: lib/tiktok/beta.ts.
 */
export const TIKTOK_MCP_SCOPE = "mcp:tt4b" as const;
export const TIKTOK_MCP_SERVERS = [
  "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer",
  "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-flat",
] as const;

export type TikTokMcpServer = (typeof TIKTOK_MCP_SERVERS)[number];

export interface TikTokOAuthConfig {
  server: TikTokMcpServer;
  clientId: string;
  redirectUri: string;
  scope: typeof TIKTOK_MCP_SCOPE;
}

// TikTok stays off on every Vercel Production deployment (production AdMate,
// www.admate.site). Staging and local runs are Preview or unset. Turning TikTok
// on for production needs a deliberate change to this line, not a setting.
export function isTikTokConnectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TIKTOK_CONNECT_ENABLED === "true" && env.VERCEL_ENV !== "production";
}

/** A staging public origin: a *.vercel.app address or a local one. Never admate.site. */
export function isStagingOrigin(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const { hostname } = new URL(env.ADMATE_PUBLIC_ORIGIN ?? "");
    return hostname.endsWith(".vercel.app") || hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export type TikTokAccessMode = "allowlist" | "open-beta";

export function tiktokAccessMode(env: NodeJS.ProcessEnv = process.env): TikTokAccessMode {
  return env.TIKTOK_CONNECT_ACCESS?.trim() === "open-beta" && isStagingOrigin(env) ? "open-beta" : "allowlist";
}

export function readTikTokOAuthConfig(env: NodeJS.ProcessEnv = process.env): TikTokOAuthConfig {
  if (!isTikTokConnectionEnabled(env)) {
    throw new Error("TikTok MCP connections are disabled");
  }

  const server = (env.TIKTOK_MCP_SERVER || TIKTOK_MCP_SERVERS[0]).replace(/\/$/, "");
  if (!(TIKTOK_MCP_SERVERS as readonly string[]).includes(server)) {
    throw new Error("Unrecognized TikTok MCP server");
  }

  const clientId = env.TIKTOK_MCP_CLIENT_ID?.trim();
  if (!clientId || /\s/.test(clientId)) {
    throw new Error("TikTok MCP client ID is not configured");
  }

  const rawOrigin = env.ADMATE_PUBLIC_ORIGIN;
  if (!rawOrigin) throw new Error("Public origin is not configured");
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("Invalid public origin");
  }

  const loopback = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if ((origin.protocol !== "https:" && !(loopback && origin.protocol === "http:")) ||
      origin.username || origin.password || origin.search || origin.hash ||
      origin.pathname !== "/" || origin.origin !== rawOrigin.replace(/\/$/, "")) {
    throw new Error("Public origin must be an HTTPS origin (HTTP allowed for localhost)");
  }

  return {
    server: server as TikTokMcpServer,
    clientId,
    redirectUri: new URL("/app/api/tiktok/oauth/callback", origin).toString(),
    scope: TIKTOK_MCP_SCOPE,
  };
}

const SUPABASE_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * May this signed-in person use TikTok? In the open beta, every signed-in person
 * (the session bridge only admits verified emails there); otherwise the explicit
 * tester allowlist (Supabase user IDs). Fails closed.
 */
export function isTikTokUserAllowed(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isTikTokConnectionEnabled(env) || !SUPABASE_USER_ID.test(userId)) return false;
  if (tiktokAccessMode(env) === "open-beta") return true;
  return (env.TIKTOK_CONNECT_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .includes(userId);
}

/** Base64 AES-256 key for stored tokens (server-only secret). */
export function readTikTokEncryptionKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.TIKTOK_CONNECT_ENCRYPTION_KEY?.trim();
  if (!key) throw new Error("TikTok encryption key is not configured");
  return key;
}
