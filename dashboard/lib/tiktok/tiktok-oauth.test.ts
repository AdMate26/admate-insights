import { describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { TIKTOK_MCP_SERVERS, readTikTokOAuthConfig } from "./config";
import { createTikTokPKCE, decryptTikTokSecret, encryptTikTokSecret } from "./crypto";
import { buildTikTokAuthorizationUrl, exchangeTikTokOAuthCode, parseTikTokOAuthMetadata, refreshTikTokOAuthTokens } from "./oauth";

const config = {
  server: TIKTOK_MCP_SERVERS[0],
  clientId: "test-public-client",
  redirectUri: "http://localhost:3000/app/api/tiktok/oauth/callback",
  scope: "mcp:tt4b" as const,
};
const metadata = parseTikTokOAuthMetadata({
  authorization_endpoint: "https://business-api.tiktok.com/example/authorize",
  token_endpoint: "https://business-api.tiktok.com/example/token",
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["mcp:tt4b"],
});

describe("TikTok OAuth foundations", () => {
  it("stays disabled without an explicit feature flag", () => {
    expect(() => readTikTokOAuthConfig({} as NodeJS.ProcessEnv)).toThrow(/disabled/);
  });

  it("constructs only an exact safe callback", () => {
    const env = {
      TIKTOK_CONNECT_ENABLED: "true",
      TIKTOK_MCP_CLIENT_ID: "test-public-client",
      ADMATE_PUBLIC_ORIGIN: "http://localhost:3000",
    } as NodeJS.ProcessEnv;
    expect(readTikTokOAuthConfig(env).redirectUri).toBe(config.redirectUri);
    expect(() => readTikTokOAuthConfig({ ...env, ADMATE_PUBLIC_ORIGIN: "http://evil.example" })).toThrow();
    expect(() => readTikTokOAuthConfig({ ...env, TIKTOK_MCP_SERVER: "https://evil.example/mcp" })).toThrow();
  });

  it("generates random one-use inputs with an RFC7636 SHA256 challenge", () => {
    const a = createTikTokPKCE();
    const b = createTikTokPKCE();
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(createHash("sha256").update(a.verifier, "ascii").digest("base64url"));
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("encrypts per user and purpose, detecting altered ciphertext", () => {
    const key = randomBytes(32).toString("base64");
    const sealed = encryptTikTokSecret("secret", key, "user-a", "refresh");
    expect(sealed).not.toContain("secret");
    expect(decryptTikTokSecret(sealed, key, "user-a", "refresh")).toBe("secret");
    expect(() => decryptTikTokSecret(sealed, key, "user-b", "refresh")).toThrow();
    expect(() => decryptTikTokSecret(sealed, key, "user-a", "access")).toThrow();
  });

  it("rejects unexpected metadata endpoints or missing PKCE support", () => {
    const base = {
      authorization_endpoint: "https://evil.example/authorize",
      token_endpoint: "https://business-api.tiktok.com/token",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code"],
    };
    expect(() => parseTikTokOAuthMetadata(base)).toThrow(/Untrusted/);
    expect(() => parseTikTokOAuthMetadata({ ...base, authorization_endpoint: "https://business-api.tiktok.com/auth", code_challenge_methods_supported: ["plain"] })).toThrow(/PKCE/);
  });

  it("builds a resource-bound URL with all PKCE parameters", () => {
    const url = new URL(buildTikTokAuthorizationUrl({ config, metadata, state: "s", challenge: "c" }));
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("resource")).toBe(config.server);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
  });

  it("exchanges code server-side with the exact verifier and redirect", async () => {
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("code_verifier")).toBe("verifier");
      expect(body.get("redirect_uri")).toBe(config.redirectUri);
      return new Response(JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 86400,
        refresh_token_expires_in: 2592000,
        scope: "mcp:tt4b",
      }), { status: 200 });
    });
    const result = await exchangeTikTokOAuthCode({ config, metadata, code: "code", verifier: "verifier", fetcher: fetcher as typeof fetch });
    expect(result.access_token).toBe("access");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("accepts refresh-token rotation and fails safely on invalid grants", async () => {
    const rotated = await refreshTikTokOAuthTokens({
      config, metadata, refreshToken: "old",
      fetcher: (async () => new Response(JSON.stringify({
        access_token: "new-access", refresh_token: "new-refresh",
        token_type: "Bearer", expires_in: 86400,
      }), { status: 200 })) as typeof fetch,
    });
    expect(rotated.refresh_token).toBe("new-refresh");
    await expect(refreshTikTokOAuthTokens({
      config, metadata, refreshToken: "old",
      fetcher: (async () => new Response("invalid_grant", { status: 400 })) as typeof fetch,
    })).rejects.toThrow(/refresh failed/);
  });
});
