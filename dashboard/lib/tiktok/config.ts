/**
 * TikTok for Business MCP OAuth configuration.
 * Off by default. No OAuth endpoints are exposed by this module.
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

export function isTikTokConnectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TIKTOK_CONNECT_ENABLED === "true";
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
