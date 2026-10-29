// TikTok MCP multi-user connection (lib/tiktok/, app/api/tiktok/*): authorization,
// replay, session binding, rotation, tenant isolation and denial cases. Embedded
// database, fake Supabase Auth and a fake TikTok; no network, no real tokens.
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The first test in this file sets up the embedded database and a sample account.
vi.setConfig({ testTimeout: 20_000 });

let jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const ORIGIN = "http://localhost:3000";
const SERVER = "https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer";
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const C = "cccccccc-3333-4333-8333-333333333333"; // signed in, not on the tester allowlist
const PEOPLE: Record<string, { id: string; email: string }> = {
  "a.jwt.sig": { id: A, email: "a@example.test" },
  "b.jwt.sig": { id: B, email: "b@example.test" },
  "c.jwt.sig": { id: C, email: "c@example.test" },
};
const ADVERTISER = "7000000000001";

// ---- fake TikTok -----------------------------------------------------------
const tiktok = {
  challenges: new Map<string, string>(), // state -> challenge from the consent URL
  exchanges: 0,
  refreshes: 0,
  revoked: [] as string[],
  dead: new Set<string>(), // refresh tokens TikTok no longer accepts
  issued: 0,
  mcpTokens: [] as string[],
  readOnly: true,
};
function issue() {
  tiktok.issued += 1;
  return { access_token: `acc-${tiktok.issued}`, refresh_token: `ref-${tiktok.issued}`, token_type: "Bearer", expires_in: 86400, refresh_token_expires_in: 2592000, scope: "mcp:tt4b" };
}
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === "https://auth.supabase.test/auth/v1/user") {
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    return PEOPLE[token] ? json(PEOPLE[token]) : json({}, { status: 401 });
  }
  if (url === `${SERVER}/oauth/.well-known/openid-configuration`) {
    return json({
      authorization_endpoint: "https://business-api.tiktok.com/portal/mcp-tt4b-authorize",
      token_endpoint: `${SERVER}/oauth/token`,
      revocation_endpoint: `${SERVER}/oauth/revoke`,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp:tt4b"],
    });
  }
  if (url === `${SERVER}/oauth/token`) {
    const body = new URLSearchParams(String(init?.body));
    if (body.get("grant_type") === "authorization_code") {
      tiktok.exchanges += 1;
      const [, state] = (body.get("code") ?? "").split(":");
      const challenge = tiktok.challenges.get(state ?? "");
      const ok = challenge && createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url") === challenge && body.get("redirect_uri") === `${ORIGIN}/app/api/tiktok/oauth/callback`;
      return ok ? json(issue()) : json({ error: "invalid_grant" }, { status: 400 });
    }
    tiktok.refreshes += 1;
    const old = body.get("refresh_token") ?? "";
    if (tiktok.dead.has(old)) return json({ error: "invalid_grant", error_description: "refresh token revoked" }, { status: 400 });
    tiktok.dead.add(old); // rotation: the old refresh token stops working
    return json(issue());
  }
  if (url === `${SERVER}/oauth/revoke`) {
    tiktok.revoked.push(new URLSearchParams(String(init?.body)).get("token") ?? "");
    return json({ revoked: true });
  }
  if (url === SERVER) {
    tiktok.mcpTokens.push(new Headers(init?.headers).get("authorization") ?? "");
    const rpc = JSON.parse(String(init?.body)) as { id?: number; method: string; params?: { name?: string } };
    if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
    const reply = (result: unknown) => json({ jsonrpc: "2.0", id: rpc.id, result }, { headers: { "mcp-session-id": "mcp-session-1" } });
    if (rpc.method === "initialize") return reply({ protocolVersion: "2025-06-18", capabilities: {} });
    if (rpc.method === "tools/list")
      return reply({
        tools: [
          { name: "auth_advertiser_get", annotations: { readOnlyHint: tiktok.readOnly }, inputSchema: { type: "object", properties: {} } },
          { name: "advertiser_info_get", annotations: { readOnlyHint: true }, inputSchema: { type: "object", required: ["advertiser_ids"] } },
          { name: "campaign_create", annotations: { readOnlyHint: false }, inputSchema: { type: "object" } },
        ],
      });
    if (rpc.method === "tools/call" && rpc.params?.name === "auth_advertiser_get")
      return reply({ content: [{ type: "text", text: JSON.stringify({ code: 0, message: "OK", data: { list: [{ advertiser_id: ADVERTISER, advertiser_name: "Lotus TikTok" }] } }) }] });
    if (rpc.params?.name === "advertiser_info_get")
      return reply({ content: [{ type: "text", text: JSON.stringify({ code: 0, data: { list: [{ advertiser_id: ADVERTISER, name: "Lotus TikTok", currency: "USD", timezone: "Asia/Phnom_Penh", status: "STATUS_ENABLE" }] } }) }] });
    return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "no" } });
  }
  return new Response("not found", { status: 404 });
}

// ---- helpers ---------------------------------------------------------------
const browsers: Record<string, typeof jar> = {};
async function signIn(person: "a" | "b" | "c", browser: string = person) {
  jar = browsers[browser] ?? new Map();
  browsers[browser] = jar;
  const { POST } = await import("@/app/api/session/route");
  const res = await POST(new Request(`${ORIGIN}/app/api/session`, { method: "POST", headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", authorization: `Bearer ${person}.jwt.sig` } }));
  expect(res.status).toBe(200);
}
function use(browser: string) {
  jar = browsers[browser]!;
}
const req = (route: string, init: RequestInit = {}, origin: string | null = ORIGIN) => {
  const headers = new Headers(init.headers);
  if (origin) headers.set("origin", origin);
  headers.set("sec-fetch-site", origin === ORIGIN ? "same-origin" : "cross-site");
  return new Request(`${ORIGIN}/app${route}`, { ...init, headers });
};
async function start(): Promise<{ status: number; state: string; url: URL | null }> {
  const { POST } = await import("@/app/api/tiktok/oauth/start/route");
  const res = await POST(req("/api/tiktok/oauth/start", { method: "POST" }));
  if (res.status !== 200) return { status: res.status, state: "", url: null };
  const url = new URL((await res.json()).url);
  const state = url.searchParams.get("state")!;
  tiktok.challenges.set(state, url.searchParams.get("code_challenge")!);
  return { status: 200, state, url };
}
async function callback(state: string, code = `code:${state}`) {
  const { GET } = await import("@/app/api/tiktok/oauth/callback/route");
  const res = await GET(req(`/api/tiktok/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {}, null));
  return { status: res.status, result: new URL(res.headers.get("location") ?? "http://x/").searchParams.get("result") };
}
async function db() {
  const { getDb } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  return { db: await getDb(), schema, eq };
}

beforeAll(async () => {
  process.env.ADMATE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "admate-tiktok-"));
  delete process.env.DATABASE_URL;
  process.env.TIKTOK_CONNECT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  // Create and migrate the embedded database once, before the timed tests.
  await (await import("@/lib/db/client")).getDb();
}, 60_000);

beforeEach(() => {
  process.env.ADMATE_PUBLIC_ORIGIN = ORIGIN;
  process.env.ADMATE_ACCESS = "open";
  process.env.SUPABASE_URL = "https://auth.supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.TIKTOK_CONNECT_ENABLED = "true";
  process.env.TIKTOK_MCP_CLIENT_ID = "admate-test-client";
  process.env.TIKTOK_CONNECT_ALLOWED_USER_IDS = `${A},${B}`;
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  tiktok.readOnly = true;
  vi.stubGlobal("fetch", fakeFetch);
});

describe("TikTok connection: access control", () => {
  it("is invisible (404) when the feature is off, even for allowlisted people", async () => {
    await signIn("a");
    process.env.TIKTOK_CONNECT_ENABLED = "false";
    const status = await import("@/app/api/tiktok/connection/route");
    expect((await status.GET()).status).toBe(404);
    expect((await start()).status).toBe(404);
    expect((await callback("x")).status).toBe(404);
  });

  it("refuses signed-out requests (401), people not on the allowlist (403) and other sites (403)", async () => {
    jar = new Map();
    expect((await start()).status).toBe(401);
    await signIn("c");
    expect((await start()).status).toBe(403);
    await signIn("a");
    const { POST } = await import("@/app/api/tiktok/oauth/start/route");
    expect((await POST(req("/api/tiktok/oauth/start", { method: "POST" }, "https://evil.example"))).status).toBe(403);
  });
});

describe("TikTok connection: authorization", () => {
  it("starts with PKCE S256, an exact redirect and the MCP resource; stores only a hash and an encrypted verifier", async () => {
    await signIn("a");
    const { url, state } = await start();
    expect(url!.origin + url!.pathname).toBe("https://business-api.tiktok.com/portal/mcp-tt4b-authorize");
    expect(url!.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url!.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/app/api/tiktok/oauth/callback`);
    expect(url!.searchParams.get("resource")).toBe(SERVER);
    expect(url!.searchParams.get("scope")).toBe("mcp:tt4b");
    const { db: d, schema } = await db();
    const rows = await d.select().from(schema.tiktokOauthStates);
    expect(JSON.stringify(rows)).not.toContain(state);
    expect(rows.find((r) => r.userId === A)?.stateHash).toBe(createHash("sha256").update(state).digest("hex"));
  });

  it("completes once, stores tokens encrypted, and never accepts the same state again (replay)", async () => {
    await signIn("a");
    const { state } = await start();
    const before = tiktok.exchanges;
    expect(await callback(state)).toEqual({ status: 303, result: "connected" });
    expect(await callback(state)).toEqual({ status: 303, result: "oauth_state" });
    expect(tiktok.exchanges).toBe(before + 1);
    const { db: d, schema, eq } = await db();
    const [row] = await d.select().from(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, A));
    expect(row?.status).toBe("active");
    expect(JSON.stringify(row)).not.toMatch(/acc-\d|ref-\d/);
    const status = await import("@/app/api/tiktok/connection/route");
    const body = await (await status.GET()).json();
    expect(body).toMatchObject({ connected: true, status: "active" });
    expect(JSON.stringify(body)).not.toMatch(/acc-|ref-/);
  });

  it("refuses a callback from another browser session or another person (session mismatch)", async () => {
    await signIn("a", "a-laptop");
    const { state } = await start();
    await signIn("a", "a-phone"); // same person, different dashboard session
    expect((await callback(state)).result).toBe("oauth_state");
    await signIn("b");
    expect((await callback(state)).result).toBe("oauth_state");
    use("a-laptop");
    expect((await callback(state)).result).toBe("connected"); // still usable by the browser that started it
  });

  it("refuses an expired attempt and a cancelled consent", async () => {
    await signIn("a");
    const { state } = await start();
    const { completeTikTokConnection } = await import("@/lib/tiktok/service");
    await expect(completeTikTokConnection(A, jar.get("admate_session")!.value, state, `code:${state}`, { now: () => new Date(Date.now() + 11 * 60_000) })).rejects.toMatchObject({ code: "oauth_state" });
    const { GET } = await import("@/app/api/tiktok/oauth/callback/route");
    const res = await GET(req("/api/tiktok/oauth/callback?error=access_denied&state=x", {}, null));
    expect(new URL(res.headers.get("location")!).searchParams.get("result")).toBe("cancelled");
  });
});

describe("TikTok connection: tokens", () => {
  it("refreshes an expiring token with rotation, once even when asked twice at the same time", async () => {
    await signIn("a");
    await callback((await start()).state);
    const { db: d, schema, eq } = await db();
    await d.update(schema.tiktokConnections).set({ accessExpiresAt: new Date(Date.now() + 60_000) }).where(eq(schema.tiktokConnections.userId, A));
    const [before] = await d.select().from(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, A));
    const refreshes = tiktok.refreshes;
    const { tikTokAccessToken } = await import("@/lib/tiktok/service");
    const [t1, t2] = await Promise.all([tikTokAccessToken(A), tikTokAccessToken(A)]);
    expect(t1).toBe(t2);
    expect(tiktok.refreshes).toBe(refreshes + 1);
    const [after] = await d.select().from(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, A));
    expect(after!.tokenVersion).toBe(before!.tokenVersion + 1);
    expect(after!.refreshTokenEnc).not.toBe(before!.refreshTokenEnc);
    expect(after!.refreshExpiresAt!.getTime()).toBeLessThanOrEqual(before!.refreshExpiresAt!.getTime()); // the 30-day window never grows
    expect(await tikTokAccessToken(A)).toBe(t1); // still valid: no new refresh
    expect(tiktok.refreshes).toBe(refreshes + 1);
  });

  it("asks to reconnect when TikTok rejects the refresh token or the 30-day window has ended", async () => {
    await signIn("a");
    await callback((await start()).state);
    const { db: d, schema, eq } = await db();
    const { tikTokAccessToken, tikTokConnectionStatus } = await import("@/lib/tiktok/service");
    await d.update(schema.tiktokConnections).set({ accessExpiresAt: new Date(0) }).where(eq(schema.tiktokConnections.userId, A));
    tiktok.dead.add(`ref-${tiktok.issued}`);
    await expect(tikTokAccessToken(A)).rejects.toMatchObject({ code: "reauth_required" });
    expect((await tikTokConnectionStatus(A)).status).toBe("reauth_required");
    const [row] = await d.select().from(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, A));
    expect(row!.accessTokenEnc).toBeNull();
    expect(row!.refreshTokenEnc).toBeNull();

    await callback((await start()).state); // reconnect
    await d.update(schema.tiktokConnections).set({ accessExpiresAt: new Date(0), refreshExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.tiktokConnections.userId, A));
    const refreshes = tiktok.refreshes;
    await expect(tikTokAccessToken(A)).rejects.toMatchObject({ code: "reauth_required" });
    expect(tiktok.refreshes).toBe(refreshes); // no call to TikTok after the window ends
  });
});

describe("TikTok connection: advertisers and tenant isolation", () => {
  it("lists authorized advertisers read-only with the person's own token", async () => {
    await signIn("a");
    await callback((await start()).state);
    const { GET } = await import("@/app/api/tiktok/advertisers/route");
    const before = tiktok.mcpTokens.length;
    const body = await (await GET()).json();
    expect(body.advertisers).toEqual([{ id: ADVERTISER, name: "Lotus TikTok", currency: "USD", timezone: "Asia/Phnom_Penh", status: "STATUS_ENABLE" }]);
    const used = new Set(tiktok.mcpTokens.slice(before));
    expect(used.size).toBe(1);
    expect([...used][0]).toMatch(/^Bearer acc-\d+$/);
  });

  it("refuses write tools and tools TikTok does not mark read-only", async () => {
    const { TikTokMcp } = await import("@/lib/tiktok/mcp");
    const client = new TikTokMcp(SERVER, "acc-x", fakeFetch as typeof fetch);
    await client.initialize();
    await expect(client.read("campaign_create", {})).rejects.toMatchObject({ code: "forbidden_tool" });
    tiktok.readOnly = false;
    await expect(new TikTokMcp(SERVER, "acc-x", fakeFetch as typeof fetch).read("auth_advertiser_get", {})).rejects.toMatchObject({ code: "schema" });
    await expect(client.read("advertiser_info_get", {})).rejects.toMatchObject({ code: "schema" }); // required parameter missing
  });

  it("keeps people apart: no shared status, advertisers, links or ad accounts", async () => {
    await signIn("a");
    await callback((await start()).state);
    const { db: d, schema, eq } = await db();
    const [wsA] = await d.select().from(schema.workspaces).where(eq(schema.workspaces.ownerId, A));
    const status = await import("@/app/api/tiktok/connection/route");
    const adv = await import("@/app/api/tiktok/advertisers/route");
    const link = (advertiserId: string, workspaceId: string) => adv.POST(req("/api/tiktok/advertisers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ advertiserId, workspaceId }) }));

    await signIn("b");
    await d.delete(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, B));
    const [wsB] = await d.select().from(schema.workspaces).where(eq(schema.workspaces.ownerId, B));
    expect(await (await status.GET()).json()).toMatchObject({ connected: false, status: "not_connected" });
    expect((await adv.GET()).status).toBe(404); // B has no connection; never A's
    expect((await link(ADVERTISER, wsA!.id)).status).toBe(403); // A's ad account

    use("a");
    expect((await link(ADVERTISER, wsB!.id)).status).toBe(403); // B's ad account
    expect((await link("7999999999999", wsA!.id)).status).toBe(403); // not an advertiser A authorized
    expect((await link(ADVERTISER, wsA!.id)).status).toBe(200);
    expect((await (await adv.GET()).json()).links).toEqual([{ advertiserId: ADVERTISER, workspaceId: wsA!.id }]);

    use("b");
    const rows = await d.select().from(schema.tiktokAdvertiserLinks).where(eq(schema.tiktokAdvertiserLinks.userId, B));
    expect(rows).toHaveLength(0);
  });

  it("disconnect revokes at TikTok and deletes everything stored for that person only", async () => {
    await signIn("b");
    await callback((await start()).state);
    await signIn("a");
    await callback((await start()).state);
    const revoked = tiktok.revoked.length;
    const status = await import("@/app/api/tiktok/connection/route");
    expect((await status.DELETE(req("/api/tiktok/connection", { method: "DELETE" }))).status).toBe(200);
    expect(tiktok.revoked.length).toBe(revoked + 2);
    const { db: d, schema, eq } = await db();
    expect(await d.select().from(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, A))).toHaveLength(0);
    expect(await d.select().from(schema.tiktokAdvertiserLinks).where(eq(schema.tiktokAdvertiserLinks.userId, A))).toHaveLength(0);
    expect(await d.select().from(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, B))).toHaveLength(1);
    expect((await status.DELETE(req("/api/tiktok/connection", { method: "DELETE" }, "https://evil.example"))).status).toBe(403);
  });
});
