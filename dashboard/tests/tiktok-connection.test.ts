// TikTok MCP multi-user connection (lib/tiktok/, app/api/tiktok/*): authorization,
// replay, session binding, rotation, tenant isolation and denial cases. Embedded
// database, fake Supabase Auth and a fake TikTok; no network, no real tokens.
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Work a route hands to `after()` (Sync Now's background run) is collected here.
const afterTasks: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(Promise.resolve().then(task)),
}));
// The first test in this file sets up the embedded database and a sample account.
// Against a real, remote Postgres (ADMATE_TEST_DATABASE_URL) every query crosses the network.
const SLOW = process.env.ADMATE_TEST_DATABASE_URL ? 10 : 1;
vi.setConfig({ testTimeout: 20_000 * SLOW });

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
// Self-service beta testers (not on any allowlist); D's email was never confirmed.
const D = "dddddddd-4444-4444-8444-444444444444";
const E = "eeeeeeee-5555-4555-8555-555555555555";
const F = "ffffffff-6666-4666-8666-666666666666";
const G = "99999999-7777-4777-8777-777777777777";
// As Supabase Auth answers /auth/v1/user: email codes and Google set email_confirmed_at.
const confirmed = "2026-10-01T00:00:00Z";
const PEOPLE: Record<string, { id: string; email: string; email_confirmed_at?: string | null }> = {
  "a.jwt.sig": { id: A, email: "a@example.test", email_confirmed_at: confirmed },
  "b.jwt.sig": { id: B, email: "b@example.test", email_confirmed_at: confirmed },
  "c.jwt.sig": { id: C, email: "c@example.test", email_confirmed_at: confirmed },
  "d.jwt.sig": { id: D, email: "d@example.test", email_confirmed_at: null },
  "e.jwt.sig": { id: E, email: "e@example.test", email_confirmed_at: confirmed },
  "f.jwt.sig": { id: F, email: "f@example.test", email_confirmed_at: confirmed },
  "g.jwt.sig": { id: G, email: "g@example.test", email_confirmed_at: confirmed },
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
  currency: "USD",
  // Simulated campaign-by-day report: every row TikTok would hold, served page by page.
  report: [] as Record<string, unknown>[],
  reportCalls: [] as Record<string, unknown>[],
  failPage: 0, // answer this page with a TikTok error…
  failTimes: Infinity, // …this many times, then normally
  failCode: 50000, // 50000 = temporary system error (retried); 40002 = bad request (final)
  onReport: null as null | (() => Promise<void>), // runs before each report page is answered
  reportFn: null as null | ((start: string, end: string) => Record<string, unknown>[]), // rows generated per request instead of `report`
  shiftTotal: false, // pretend the report changed between pages
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
          { name: "report_integrated_get", annotations: { readOnlyHint: true }, inputSchema: { type: "object", required: ["report_type", "dimensions"] } },
          { name: "campaign_create", annotations: { readOnlyHint: false }, inputSchema: { type: "object" } },
          { name: "tool_execute", annotations: { readOnlyHint: false }, inputSchema: { type: "object" } },
        ],
      });
    if (rpc.method === "tools/call" && rpc.params?.name === "auth_advertiser_get")
      return reply({ content: [{ type: "text", text: JSON.stringify({ code: 0, message: "OK", data: { list: [{ advertiser_id: ADVERTISER, advertiser_name: "Lotus TikTok" }] } }) }] });
    if (rpc.params?.name === "advertiser_info_get")
      return reply({ content: [{ type: "text", text: JSON.stringify({ code: 0, data: { list: [{ advertiser_id: ADVERTISER, name: "Lotus TikTok", currency: tiktok.currency, timezone: "Asia/Phnom_Penh", status: "STATUS_ENABLE" }] } }) }] });
    if (rpc.params?.name === "report_integrated_get") {
      const args = (rpc.params as { arguments: Record<string, unknown> }).arguments;
      tiktok.reportCalls.push(args);
      const page = Number(args.page ?? 1);
      const size = Number(args.page_size ?? 10);
      if (tiktok.onReport) await tiktok.onReport();
      if (page === tiktok.failPage && tiktok.failTimes > 0) {
        tiktok.failTimes -= 1;
        return reply({ content: [{ type: "text", text: JSON.stringify({ code: tiktok.failCode, message: "System error" }) }] });
      }
      const source = tiktok.reportFn ? tiktok.reportFn(String(args.start_date), String(args.end_date)) : tiktok.report;
      const inRange = source.filter((r) => {
        const day = String((r.dimensions as Record<string, string>).stat_time_day).slice(0, 10);
        return day >= String(args.start_date) && day <= String(args.end_date);
      });
      const total = inRange.length + (tiktok.shiftTotal && page > 1 ? 1 : 0);
      const data = { list: inRange.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: total, total_page: Math.ceil(total / size) } };
      return reply({ content: [{ type: "text", text: JSON.stringify({ code: 0, message: "OK", data }) }] });
    }
    return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "no" } });
  }
  return new Response("not found", { status: 404 });
}

// ---- helpers ---------------------------------------------------------------
const browsers: Record<string, typeof jar> = {};
async function signIn(person: "a" | "b" | "c" | "e" | "f" | "g", browser: string = person) {
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
/** A real (not sample) ad account owned by `owner`. */
async function account(owner: string, id: string, currency: string) {
  const { db: d, schema } = await db();
  await d.insert(schema.workspaces).values({ id, ownerId: owner, name: `Account ${id}`, currency }).onConflictDoUpdate({ target: schema.workspaces.id, set: { ownerId: owner, currency } });
  return { id };
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
  // Optional: run this whole file against a real, EMPTY, throwaway Postgres (for
  // example a staging database branch made for the test) to exercise true
  // concurrent transactions. Default: the embedded database.
  const realPostgres = process.env.ADMATE_TEST_DATABASE_URL?.trim();
  if (realPostgres) {
    // Only a disposable database: the expected endpoint, and no user data in it.
    const expected = process.env.ADMATE_TEST_EXPECT_ENDPOINT?.trim();
    const host = new URL(realPostgres).hostname;
    if (!expected || !host.startsWith(`${expected}.`)) throw new Error("Refused: ADMATE_TEST_DATABASE_URL is not the expected test endpoint (ADMATE_TEST_EXPECT_ENDPOINT).");
    process.env.DATABASE_URL = realPostgres;
    const pg = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new pg.default.Pool({ connectionString: realPostgres, max: 1 });
    try {
      await migrate(drizzle({ client: pool }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      const { rows } = await pool.query("select (select count(*) from users)::int as users, (select count(*) from workspaces)::int as workspaces");
      if (rows[0].users || rows[0].workspaces) throw new Error("Refused: the test database already holds users or accounts; use a fresh disposable branch.");
    } finally {
      await pool.end();
    }
  }
  process.env.TIKTOK_CONNECT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  // Create and migrate the embedded database once, before the timed tests.
  await (await import("@/lib/db/client")).getDb();
}, 60_000 * SLOW);

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
    const wsA = await account(A, "ws-a-usd", "USD");
    const [sampleA] = await d.select().from(schema.workspaces).where(eq(schema.workspaces.ownerId, A));
    const status = await import("@/app/api/tiktok/connection/route");
    const adv = await import("@/app/api/tiktok/advertisers/route");
    const link = (advertiserId: string, workspaceId: string) => adv.POST(req("/api/tiktok/advertisers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ advertiserId, workspaceId }) }));

    await signIn("b");
    await d.delete(schema.tiktokConnections).where(eq(schema.tiktokConnections.userId, B));
    const wsB = await account(B, "ws-b-usd", "USD");
    expect(await (await status.GET()).json()).toMatchObject({ connected: false, status: "not_connected" });
    expect((await adv.GET()).status).toBe(404); // B has no connection; never A's
    expect((await link(ADVERTISER, wsA!.id)).status).toBe(403); // A's ad account

    use("a");
    expect((await link(ADVERTISER, wsB!.id)).status).toBe(403); // B's ad account
    expect((await link("7999999999999", wsA!.id)).status).toBe(403); // not an advertiser A authorized
    expect(sampleA!.isSample).toBe(true);
    expect(await (await link(ADVERTISER, sampleA!.id)).json()).toEqual({ error: "sample" }); // never the sample account
    const wsKhr = await account(A, "ws-a-khr", "KHR");
    const wrongCurrency = await link(ADVERTISER, wsKhr.id); // USD advertiser, KHR account
    expect([wrongCurrency.status, await wrongCurrency.json()]).toEqual([409, { error: "currency" }]);
    expect((await link(ADVERTISER, wsA!.id)).status).toBe(200);
    expect((await (await adv.GET()).json()).links).toEqual([{ advertiserId: ADVERTISER, workspaceId: wsA!.id, lastSync: null }]);

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

// ---- Sync Now -------------------------------------------------------------
// Simulated but realistic TikTok rows: strings for numbers, "YYYY-MM-DD 00:00:00"
// days, KHR amounts with two decimals, "-" where TikTok has no value.
const CAMPAIGNS = [
  { id: "1810000000000001", name: "KH | Traffic | Always on", objective: "TRAFFIC", budget: "200000.00" },
  { id: "1810000000000002", name: "KH | Leads | Promo", objective: "LEAD_GENERATION", budget: "-" },
  { id: "1810000000000003", name: "KH | Video views", objective: "VIDEO_VIEWS", budget: "120000.00" },
];
function simulate(days: string[], campaigns = CAMPAIGNS, factor = 1) {
  const rows: Record<string, unknown>[] = [];
  days.forEach((day, i) =>
    campaigns.forEach((c, j) => {
      const spend = Math.round((41000 + 1700 * i + 9000 * j) * factor * 100) / 100;
      rows.push({
        dimensions: { campaign_id: c.id, stat_time_day: `${day} 00:00:00` },
        metrics: {
          campaign_name: c.name, objective_type: c.objective, campaign_budget: c.budget,
          spend: spend.toFixed(2), impressions: String(30000 + 500 * i), clicks: String(400 + 7 * i), reach: String(25000 + 300 * i),
          conversion: "0", complete_payment: "0", app_install: "0", registration: "0", total_landing_page_view: String(300 + 5 * i),
          video_play_actions: String(18000 + 200 * i), follows: "3", likes: "41", comments: "2", shares: "1",
          // Extra fields TikTok may add are ignored.
          video_views_p100: "900",
        },
      });
    }),
  );
  return rows;
}
const day = (base: string, n: number) => new Date(Date.parse(`${base}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Shared by the Sync Now tests below.
let clock = Date.now();
const later = () => {
  clock += 2 * 60_000; // past the one-minute cooldown
  return new Date(clock);
};
const noWait = async () => {};

async function linkedKhr() {
  await signIn("a");
  await callback((await start()).state);
  tiktok.currency = "KHR";
  const ws = await account(A, "ws-a-tiktok-khr", "KHR");
  const { db: d, schema, eq } = await db();
  await d.delete(schema.tiktokAdvertiserLinks).where(eq(schema.tiktokAdvertiserLinks.userId, A));
  const { linkTikTokAdvertiser } = await import("@/lib/tiktok/service");
  await linkTikTokAdvertiser(A, ADVERTISER, ws.id);
  return ws;
}
async function activeFacts(workspaceId: string) {
  const { db: d, schema } = await db();
  const { and, eq } = await import("drizzle-orm");
  return d.select().from(schema.facts).where(and(eq(schema.facts.workspaceId, workspaceId), eq(schema.facts.active, true)));
}
async function window() {
  const { syncWindow } = await import("@/lib/tiktok/report");
  return syncWindow("Asia/Phnom_Penh", new Date(clock));
}
// Each sync runs at its own fixed moment, two minutes after the previous one.
const sync = async () => {
  const at = later();
  return (await import("@/lib/tiktok/sync")).syncTikTokAdvertiser(A, ADVERTISER, { now: () => at, sleep: noWait });
};

function resetReport() {
  tiktok.report = [];
  tiktok.reportCalls = [];
  tiktok.failPage = 0;
  tiktok.failTimes = Infinity;
  tiktok.failCode = 50000;
  tiktok.onReport = null;
  tiktok.reportFn = null;
  tiktok.shiftTotal = false;
  tiktok.currency = "KHR";
}

describe("TikTok Sync Now", () => {
  beforeEach(resetReport);

  it("imports every page of a realistic report in KHR with advertiser-local dates and no conversion", async () => {
    const ws = await linkedKhr();
    const w = await window();
    // 400 campaigns x 3 days = 1,200 rows: two pages of 1,000.
    const many = Array.from({ length: 400 }, (_, i) => ({ id: String(1820000000000000 + i), name: `KH | Traffic ${i}`, objective: "TRAFFIC", budget: "50000.00" }));
    tiktok.report = simulate([day(w.end, -2), day(w.end, -1), w.end], many);
    const result = await sync();
    expect(result).toMatchObject({ outcome: "ok", rows: 1200, campaigns: 400, currency: "KHR", timezone: "Asia/Phnom_Penh", period: { start: day(w.end, -2), end: w.end } });
    expect(result.window).toEqual(w);

    // Fixed read-only request; only page and dates vary.
    expect(tiktok.reportCalls.map((c) => c.page)).toEqual([1, 2]);
    const { TIKTOK_REPORT_METRICS } = await import("@/lib/tiktok/report");
    for (const call of tiktok.reportCalls) {
      expect(call).toEqual({
        advertiser_id: ADVERTISER, report_type: "BASIC", data_level: "AUCTION_CAMPAIGN", dimensions: ["campaign_id", "stat_time_day"],
        metrics: TIKTOK_REPORT_METRICS, start_date: w.start, end_date: w.end, page: call.page, page_size: 1000,
        filtering: [{ field_name: "campaign_status", filter_type: "IN", filter_value: '["STATUS_ALL"]' }],
      });
    }

    const facts = await activeFacts(ws.id);
    expect(facts).toHaveLength(1200);
    const sent = tiktok.report.reduce((s, r) => s + Number((r.metrics as Record<string, string>).spend), 0);
    expect(facts.reduce((s, f) => s + f.spend, 0)).toBeCloseTo(sent, 2); // KHR as reported
    expect(new Set(facts.map((f) => f.periodStart))).toEqual(new Set([day(w.end, -2), day(w.end, -1), w.end])); // TikTok's own days
    expect(facts.every((f) => f.thruplays === 0 && f.clicksAll === 0)).toBe(true);

    const { db: d, schema, eq } = await db();
    const [imp] = await d.select().from(schema.imports).where(eq(schema.imports.id, result.importId!));
    expect(imp).toMatchObject({ platform: "tiktok", currency: "KHR", granularity: "daily", level: "campaign", periodStart: day(w.end, -2), periodEnd: w.end });
    // Unsupported measures are missing (unavailable), never zero-filled columns.
    expect(imp!.columns).toEqual(["spend", "impressions", "reach", "linkClicks", "landingPageViews", "engagements", "follows", "videoViews", "installs", "registrations", "purchases", "conversions"]);
    expect(result.unavailable.map((u) => u.measure)).toEqual(expect.arrayContaining(["thruplays", "clicksAll", "leads", "messages", "conversionValue"]));
    expect(JSON.stringify(result)).not.toMatch(/acc-|ref-/);
  });

  it("maps TikTok meanings without silently equating different metrics", async () => {
    const { normalizeTikTokReport } = await import("@/lib/tiktok/report");
    const w = { start: "2026-10-01", end: "2026-10-30" };
    const out = normalizeTikTokReport(simulate(["2026-10-05"]), w);
    const [traffic, leads, video] = out.rows;
    expect(traffic!.measures).toMatchObject({ linkClicks: 400, clicksAll: 0, reach: 25000, thruplays: 0, videoViews: 18000, engagements: 44, landingPageViews: 300 });
    expect([traffic!.objective, leads!.objective, video!.objective]).toEqual(["traffic", "leads", "video_views"]);
    expect([traffic!.budget, leads!.budget]).toEqual([200000, null]); // "-" = no campaign budget
    expect(traffic!.date).toBe("2026-10-05");
    // A metric TikTok reports as "-" everywhere is unavailable, not zero.
    const noReach = simulate(["2026-10-05"]).map((r) => ({ ...r, metrics: { ...(r.metrics as object), reach: "-" } }));
    expect(normalizeTikTokReport(noReach, w).columns).not.toContain("reach");
    // Rows outside the asked dates, or two different rows for one campaign-day, are refused.
    expect(() => normalizeTikTokReport(simulate(["2026-11-01"]), w)).toThrow(/outside/);
    const twice = [...simulate(["2026-10-05"]), ...simulate(["2026-10-05"], CAMPAIGNS, 2)];
    expect(() => normalizeTikTokReport(twice, w)).toThrow(/two different rows/);
    expect(normalizeTikTokReport([...simulate(["2026-10-05"]), ...simulate(["2026-10-05"])], w).rows).toHaveLength(3); // exact repeats collapse
  });

  it("uses the advertiser's own time zone for the 30 complete days", async () => {
    const { syncWindow } = await import("@/lib/tiktok/report");
    // 20:00 UTC on 28 Oct is already 29 Oct 03:00 in UTC+7 (written Etc/GMT-7).
    expect(syncWindow("Etc/GMT-7", new Date("2026-10-28T20:00:00Z"))).toEqual({ start: "2026-09-29", end: "2026-10-28" });
    expect(syncWindow("America/Los_Angeles", new Date("2026-10-28T20:00:00Z"))).toEqual({ start: "2026-09-28", end: "2026-10-27" });
    expect(() => syncWindow("Mars/Olympus", new Date())).toThrow();
    expect(() => syncWindow(null, new Date())).toThrow();
  });

  it("an empty report writes nothing and leaves stored data untouched", async () => {
    const ws = await linkedKhr();
    const w = await window();
    tiktok.report = simulate([day(w.end, -1), w.end]);
    await sync();
    const before = await activeFacts(ws.id);
    expect(before.length).toBeGreaterThan(0);
    const { db: d, schema, eq } = await db();
    const imports = (await d.select().from(schema.imports).where(eq(schema.imports.workspaceId, ws.id))).length;

    tiktok.report = []; // e.g. an advertiser with no campaigns
    const result = await sync();
    expect(result).toMatchObject({ outcome: "empty", rows: 0, campaigns: 0, period: null, importId: null });
    expect((await activeFacts(ws.id)).map((f) => f.id).sort()).toEqual(before.map((f) => f.id).sort());
    expect((await d.select().from(schema.imports).where(eq(schema.imports.workspaceId, ws.id))).length).toBe(imports);
  });

  it("does not re-import identical data, allows one sync at a time, and waits a minute between syncs", async () => {
    const ws = await linkedKhr();
    const w = await window();
    tiktok.report = simulate([w.end], CAMPAIGNS, 0.7);
    const first = await sync();
    expect(first.outcome).toBe("ok");
    const { db: d, schema, eq } = await db();
    const count = async () => (await d.select().from(schema.imports).where(eq(schema.imports.workspaceId, ws.id))).length;
    const imports = await count();
    const again = await sync();
    expect(again).toMatchObject({ outcome: "unchanged", importId: first.importId });
    expect(await count()).toBe(imports); // nothing new written

    tiktok.report = simulate([w.end], CAMPAIGNS, 1.1);
    const at = later();
    const { syncTikTokAdvertiser } = await import("@/lib/tiktok/sync");
    const both = await Promise.allSettled([syncTikTokAdvertiser(A, ADVERTISER, { now: () => at, sleep: noWait }), syncTikTokAdvertiser(A, ADVERTISER, { now: () => at, sleep: noWait })]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(both.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "busy" } });
    // Right after a finished sync: too soon.
    await expect(syncTikTokAdvertiser(A, ADVERTISER, { now: () => new Date(at.getTime() + 10_000), sleep: noWait })).rejects.toMatchObject({ code: "busy" });
  });

  it("a failed or changing report writes nothing and frees the lock", async () => {
    const ws = await linkedKhr();
    const w = await window();
    const many = Array.from({ length: 400 }, (_, i) => ({ id: String(1830000000000000 + i), name: `KH | Reach ${i}`, objective: "REACH", budget: "-" }));
    tiktok.report = simulate([day(w.end, -2), day(w.end, -1), w.end], many);
    const before = (await activeFacts(ws.id)).length;

    tiktok.failPage = 2; // page 1 arrives, page 2 fails
    await expect(sync()).rejects.toMatchObject({ code: "provider" });
    expect((await activeFacts(ws.id)).length).toBe(before);

    tiktok.failPage = 0;
    tiktok.shiftTotal = true; // the row count changes between pages
    await expect(sync()).rejects.toMatchObject({ code: "report" });
    expect((await activeFacts(ws.id)).length).toBe(before);

    tiktok.shiftTotal = false;
    expect((await sync()).outcome).toBe("ok"); // lock was released
    const { tikTokSyncStatus } = await import("@/lib/tiktok/sync");
    expect((await tikTokSyncStatus(A)).find((s) => s.workspaceId === ws.id)).toMatchObject({ running: false, outcome: "ok" });
  });

  it("a newer sync replaces only the days TikTok returned; undo brings earlier data back without double counting", async () => {
    const ws = await linkedKhr();
    const w = await window();
    const { db: d, schema } = await db();
    const { and, eq, inArray } = await import("drizzle-orm");
    await d.delete(schema.imports).where(eq(schema.imports.workspaceId, ws.id)); // start clean
    const spendOf = async () => Math.round((await activeFacts(ws.id)).reduce((s, f) => s + f.spend, 0) * 100) / 100;
    const sum = (rows: Record<string, unknown>[]) => Math.round(rows.reduce((s, r) => s + Number((r.metrics as Record<string, string>).spend), 0) * 100) / 100;

    const r1 = simulate([day(w.end, -3), day(w.end, -2), day(w.end, -1)]);
    tiktok.report = r1;
    const s1 = await sync();
    const r2 = simulate([day(w.end, -1), w.end], CAMPAIGNS, 1.2); // overlaps one day
    tiktok.report = r2;
    const s2 = await sync();
    expect(s2.diff!.replaced.map((x) => x.id)).toEqual([s1.importId]);
    const r1Kept = r1.filter((r) => !String((r.dimensions as Record<string, string>).stat_time_day).startsWith(day(w.end, -1)));
    expect(await spendOf()).toBe(sum([...r1Kept, ...r2])); // days before the overlap stay
    const r3 = simulate([day(w.end, -1), w.end], CAMPAIGNS, 1.5);
    tiktok.report = r3;
    const s3 = await sync();
    expect(await spendOf()).toBe(sum([...r1Kept, ...r3]));

    const { undoImport } = await import("@/lib/data/imports");
    await undoImport(d, ws.id, s2.importId!); // the middle sync
    expect(await spendOf()).toBe(sum([...r1Kept, ...r3])); // no double counting next to the newest
    await undoImport(d, ws.id, s3.importId!); // now the newest: the first sync's day comes back
    expect(await spendOf()).toBe(sum(r1));
    const left = await d.select().from(schema.imports).where(and(eq(schema.imports.workspaceId, ws.id), inArray(schema.imports.id, [s1.importId!, s2.importId!, s3.importId!])));
    expect(Object.fromEntries(left.map((i) => [i.id, i.status]))).toEqual({ [s1.importId!]: "active", [s2.importId!]: "undone", [s3.importId!]: "undone" });
  });

  it("re-checks currency and ownership on every sync; one person's advertiser never reaches another's account", async () => {
    const ws = await linkedKhr();
    const w = await window();
    tiktok.report = simulate([w.end]);
    const { db: d, schema, eq } = await db();
    const { and } = await import("drizzle-orm");
    const wsB = await account(B, "ws-b-khr", "KHR");
    const tiktokFactsIn = async (id: string) => (await d.select().from(schema.facts).where(and(eq(schema.facts.workspaceId, id), eq(schema.facts.platform, "tiktok")))).length;

    // The ad account's currency was changed after linking: refused, nothing written.
    await d.update(schema.workspaces).set({ currency: "USD" }).where(eq(schema.workspaces.id, ws.id));
    const before = await tiktokFactsIn(ws.id);
    await expect(sync()).rejects.toMatchObject({ code: "currency" });
    expect(await tiktokFactsIn(ws.id)).toBe(before);
    await d.update(schema.workspaces).set({ currency: "KHR" }).where(eq(schema.workspaces.id, ws.id));

    // A link row pointing A's advertiser at B's account (tampered data): refused.
    await d.update(schema.tiktokAdvertiserLinks).set({ workspaceId: wsB.id }).where(eq(schema.tiktokAdvertiserLinks.userId, A));
    await expect(sync()).rejects.toMatchObject({ code: "workspace" });
    expect(await tiktokFactsIn(wsB.id)).toBe(0);
    await d.update(schema.tiktokAdvertiserLinks).set({ workspaceId: ws.id }).where(eq(schema.tiktokAdvertiserLinks.userId, A));

    // B (connected, no link) cannot sync A's advertiser, through the service or the route.
    await signIn("b");
    await callback((await start()).state);
    const { syncTikTokAdvertiser } = await import("@/lib/tiktok/sync");
    const atB = later();
    await expect(syncTikTokAdvertiser(B, ADVERTISER, { now: () => atB, sleep: noWait })).rejects.toMatchObject({ code: "advertiser" });
    const route = await import("@/app/api/tiktok/sync/route");
    const post = (body: unknown, origin: string | null = ORIGIN) => route.POST(req("/api/tiktok/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, origin));
    expect(await (await post({ advertiserId: ADVERTISER })).json()).toEqual({ error: "advertiser" });
    expect(await tiktokFactsIn(wsB.id)).toBe(0);
    expect((await post({ advertiserId: "x" })).status).toBe(400);
    expect((await post({ advertiserId: ADVERTISER }, "https://evil.example")).status).toBe(403);
    jar = new Map();
    expect((await post({ advertiserId: ADVERTISER })).status).toBe(401);
    await signIn("a");
    process.env.TIKTOK_CONNECT_ENABLED = "false";
    expect((await post({ advertiserId: ADVERTISER })).status).toBe(404);
    process.env.TIKTOK_CONNECT_ENABLED = "true";
    await d.delete(schema.tiktokSyncs).where(eq(schema.tiktokSyncs.workspaceId, ws.id)); // the route runs on the real clock, not the test's
    const ok = await post({ advertiserId: ADVERTISER });
    expect(ok.status).toBe(202); // answered at once; the reading and writing continue in the background
    expect(await ok.json()).toMatchObject({ started: true, window: { start: expect.any(String), end: expect.any(String) } });
    await Promise.all(afterTasks.splice(0));
    const polled = await route.GET(req(`/api/tiktok/sync?advertiserId=${ADVERTISER}`));
    const body = await polled.json();
    expect(body.status).toMatchObject({ running: false, outcome: "ok", summary: { outcome: "ok", currency: "KHR", rows: 3, campaigns: 3 } });
    expect(JSON.stringify(body)).not.toMatch(/acc-|ref-|Bearer/);
    expect((await post({ advertiserId: ADVERTISER })).status).toBe(409); // a second click right away: busy, nothing started
    expect((await route.GET(req("/api/tiktok/sync?advertiserId=x"))).status).toBe(400);
  });

  it("never calls write tools or the general tool runner", async () => {
    const { TikTokMcp, READ_TOOLS } = await import("@/lib/tiktok/mcp");
    expect([...READ_TOOLS].sort()).toEqual(["advertiser_info_get", "auth_advertiser_get", "report_integrated_get"]);
    const client = new TikTokMcp(SERVER, "acc-x", fakeFetch as typeof fetch);
    await client.initialize();
    await expect(client.read("tool_execute", { tool_name: "campaign_get" })).rejects.toMatchObject({ code: "forbidden_tool" });
    await expect(client.read("campaign_create", {})).rejects.toMatchObject({ code: "forbidden_tool" });
  });
});

// ---- Phase 5: data integrity, the analysis journey, reliability ------------
// An uploaded export, committed exactly like the upload page does (newest upload
// wins across the platform's whole period).
type Up = { campaign: string; campaignId?: string | null; date?: string; from?: string; to?: string; adGroup?: string; ad?: string; spend: number; clicks?: number };
async function upload(workspaceId: string, platform: "tiktok" | "meta", rows: Up[], fileName = "upload.csv") {
  const { commitImport } = await import("@/lib/data/imports");
  const { emptyMeasures } = await import("@/lib/metrics/measures");
  const { db: d } = await db();
  const days = rows.flatMap((r) => (r.date ? [r.date] : [r.from!, r.to!])).sort();
  return commitImport(d, {
    workspaceId, fileName, platform, level: rows.some((r) => r.ad) ? "ad" : "campaign", granularity: rows.some((r) => r.date) ? "daily" : "snapshot",
    period: { start: days[0]!, end: days[days.length - 1]! }, currency: "KHR", attribution: null, warnings: [], columns: ["spend", "impressions", "linkClicks"],
    rows: rows.map((r) => ({
      campaign: r.campaign, campaignId: r.campaignId ?? null, adGroup: r.adGroup ?? null, adGroupId: null, ad: r.ad ?? null, adId: null,
      date: r.date ?? null, periodStart: r.from ?? null, periodEnd: r.to ?? null, status: null, secondaryStatus: null, objective: "traffic" as const, objectiveSource: "user" as const, budget: null,
      measures: { ...emptyMeasures(), spend: r.spend, impressions: r.spend * 10, linkClicks: r.clicks ?? 10 },
    })),
  });
}
/** Active spend per campaign name (and level), so tests read like the dashboard. */
async function spendBy(workspaceId: string) {
  const { db: d, schema } = await db();
  const { and, eq } = await import("drizzle-orm");
  const rows = await d
    .select({ name: schema.entities.name, spend: schema.facts.spend, platform: schema.facts.platform, adId: schema.facts.adId, day: schema.facts.periodStart, to: schema.facts.periodEnd })
    .from(schema.facts)
    .innerJoin(schema.entities, eq(schema.entities.id, schema.facts.campaignId))
    .where(and(eq(schema.facts.workspaceId, workspaceId), eq(schema.facts.active, true)));
  const total = (pred: (r: (typeof rows)[number]) => boolean) => Math.round(rows.filter(pred).reduce((s, r) => s + r.spend, 0) * 100) / 100;
  return { rows, total };
}
async function freshKhr(id: string) {
  await linkedKhr();
  const { db: d, schema, eq } = await db();
  const ws = await account(A, id, "KHR");
  await d.delete(schema.imports).where(eq(schema.imports.workspaceId, ws.id));
  await d.delete(schema.entities).where(eq(schema.entities.workspaceId, ws.id));
  await d.delete(schema.tiktokSyncs).where(eq(schema.tiktokSyncs.userId, A));
  await d.update(schema.tiktokAdvertiserLinks).set({ workspaceId: ws.id }).where(eq(schema.tiktokAdvertiserLinks.userId, A));
  return ws;
}
const [TRAFFIC] = CAMPAIGNS;

describe("TikTok Sync: what a sync may replace", () => {
  beforeEach(resetReport);

  it("never hides uploads of other campaigns or other platforms in the same dates", async () => {
    const ws = await freshKhr("ws-p5-unrelated");
    const w = await window();
    const days = [day(w.end, -4), day(w.end, -3), day(w.end, -2)];
    await upload(ws.id, "tiktok", days.map((date) => ({ campaign: "KH | Older campaign (CSV only)", date, spend: 1000 })), "tiktok-older.csv");
    await upload(ws.id, "meta", days.map((date) => ({ campaign: "Meta | Prospecting", date, spend: 2000 })), "meta.csv");
    tiktok.report = simulate(days);
    expect((await sync()).outcome).toBe("ok");
    const { total } = await spendBy(ws.id);
    expect(total((r) => r.name === "KH | Older campaign (CSV only)")).toBe(3000); // was hidden before Phase 5
    expect(total((r) => r.platform === "meta")).toBe(6000);
    expect(total((r) => r.name === TRAFFIC!.name)).toBe(sumSpend(tiktok.report, TRAFFIC!.id));
  });

  it("replaces an uploaded campaign only on the days TikTok returned (sparse days), never the others", async () => {
    const ws = await freshKhr("ws-p5-sparse");
    const w = await window();
    const five = [-6, -5, -4, -3, -2].map((n) => day(w.end, n));
    // The same campaign uploaded earlier, matched by TikTok's campaign ID; one day at ad level too.
    await upload(ws.id, "tiktok", [...five.map((date) => ({ campaign: TRAFFIC!.name, campaignId: TRAFFIC!.id, date, spend: 500 }))], "daily.csv");
    await upload(ws.id, "tiktok", [{ campaign: TRAFFIC!.name, campaignId: TRAFFIC!.id, date: five[0]!, adGroup: "AG 1", ad: "Ad 1", spend: 70 }], "ads.csv");
    tiktok.report = simulate([five[1]!, five[3]!], [TRAFFIC!]); // TikTok has rows on 2 of the 5 days
    const result = await sync();
    expect(result).toMatchObject({ outcome: "ok", skipped: 0 });
    const { rows, total } = await spendBy(ws.id);
    const byDay = (d: string) => total((r) => r.name === TRAFFIC!.name && r.day === d);
    expect(byDay(five[1]!)).toBe(sumSpend(tiktok.report, TRAFFIC!.id, five[1]));
    expect(byDay(five[3]!)).toBe(sumSpend(tiktok.report, TRAFFIC!.id, five[3]));
    // Days without a TikTok row keep the uploaded numbers. Note: "ads.csv" was
    // uploaded after "daily.csv" and already replaced that file's day five[0].
    expect([byDay(five[0]!), byDay(five[2]!), byDay(five[4]!)]).toEqual([70, 500, 500]);
    expect(rows.filter((r) => r.name === TRAFFIC!.name && r.day === five[1]).length).toBe(1); // no double counting
  });

  it("keeps a summary export that reaches outside the window and leaves out the sync's overlapping days", async () => {
    const ws = await freshKhr("ws-p5-summary");
    const w = await window();
    const from = day(w.start, -10);
    const to = day(w.start, 4);
    await upload(ws.id, "tiktok", [{ campaign: TRAFFIC!.name, campaignId: TRAFFIC!.id, from, to, spend: 99_000 }], "summary.csv");
    const syncDays = [w.start, day(w.start, 4), day(w.start, 5), day(w.start, 6)];
    tiktok.report = simulate(syncDays, [TRAFFIC!]);
    const result = await sync();
    expect(result).toMatchObject({ outcome: "ok", rows: 4, skipped: 2 });
    const { total } = await spendBy(ws.id);
    expect(total((r) => r.day === from && r.to === to)).toBe(99_000); // the whole summary stays, incl. its 10 days before the window
    expect(total((r) => r.name === TRAFFIC!.name)).toBe(99_000 + sumSpend(tiktok.report, TRAFFIC!.id, day(w.start, 5)) + sumSpend(tiktok.report, TRAFFIC!.id, day(w.start, 6)));

    // When every returned day is covered by that summary: nothing is written.
    tiktok.report = simulate([w.start], [TRAFFIC!]);
    expect(await sync()).toMatchObject({ outcome: "skipped", skipped: 1, importId: null });

    // A summary entirely inside the window, with TikTok rows in it, is replaced.
    const inside = await freshKhr("ws-p5-summary-inside");
    await upload(inside.id, "tiktok", [{ campaign: TRAFFIC!.name, campaignId: TRAFFIC!.id, from: day(w.end, -3), to: w.end, spend: 12_345 }], "inside.csv");
    tiktok.report = simulate([day(w.end, -3), day(w.end, -2), day(w.end, -1), w.end], [TRAFFIC!]);
    expect((await sync()).outcome).toBe("ok");
    expect((await spendBy(inside.id)).total((r) => r.name === TRAFFIC!.name)).toBe(sumSpend(tiktok.report, TRAFFIC!.id));
  });

  it("a later sync without some campaigns or days keeps their earlier synced numbers", async () => {
    const ws = await freshKhr("ws-p5-partial");
    const w = await window();
    tiktok.report = simulate([day(w.end, -2), day(w.end, -1)]);
    const first = sumSpend(tiktok.report);
    await sync();
    tiktok.report = simulate([day(w.end, -1), w.end], [TRAFFIC!], 1.3); // only one campaign, partly new days
    await sync();
    const { total } = await spendBy(ws.id);
    expect(total((r) => r.name !== TRAFFIC!.name)).toBe(first - sumSpend(simulate([day(w.end, -2), day(w.end, -1)], [TRAFFIC!])));
    expect(total((r) => r.name === TRAFFIC!.name)).toBe(sumSpend(simulate([day(w.end, -2)], [TRAFFIC!])) + sumSpend(tiktok.report));
  });

  it("undo after a narrow sync: brings back exactly what it replaced, also from the middle of a chain", async () => {
    const ws = await freshKhr("ws-p5-undo");
    const w = await window();
    const { db: d } = await db();
    const { undoImport } = await import("@/lib/data/imports");
    const [d1, d2] = [day(w.end, -2), day(w.end, -1)];
    const csv = await upload(ws.id, "tiktok", [d1, d2].flatMap((date) => [
      { campaign: TRAFFIC!.name, campaignId: TRAFFIC!.id, date, spend: 100 },
      { campaign: "KH | Other (CSV only)", date, spend: 10 },
    ]), "first.csv");
    expect(csv.importId).toBeTruthy();
    tiktok.report = simulate([d1], [TRAFFIC!]);
    const s1 = await sync(); // replaces TRAFFIC on d1 only
    const after = await spendBy(ws.id);
    expect(after.total(() => true)).toBe(sumSpend(tiktok.report) + 100 + 20);
    // A newer upload of the whole period (replaces everything TikTok in d1..d2).
    await upload(ws.id, "tiktok", [d1, d2].map((date) => ({ campaign: TRAFFIC!.name, campaignId: TRAFFIC!.id, date, spend: 300 })), "newer.csv");
    expect((await spendBy(ws.id)).total(() => true)).toBe(600);
    await undoImport(d, ws.id, s1.importId!); // the middle import
    expect((await spendBy(ws.id)).total(() => true)).toBe(600); // what s1 replaced now belongs to newer.csv: not counted twice
    const { db: d2b, schema, eq } = await db();
    const [newer] = await d2b.select().from(schema.imports).where(eq(schema.imports.fileName, "newer.csv"));
    await undoImport(d, ws.id, newer!.id);
    expect((await spendBy(ws.id)).total(() => true)).toBe(220); // first.csv is back in full

    // Undo of the newest sync restores only the campaign-days it replaced.
    tiktok.report = simulate([d2], [TRAFFIC!]);
    const s2 = await sync();
    expect((await spendBy(ws.id)).total(() => true)).toBe(100 + 20 + sumSpend(tiktok.report));
    await undoImport(d, ws.id, s2.importId!);
    expect((await spendBy(ws.id)).total(() => true)).toBe(220);
  });
});

function sumSpend(rows: Record<string, unknown>[], campaignId?: string, onDay?: string) {
  const list = rows.filter((r) => {
    const dims = r.dimensions as Record<string, string>;
    return (!campaignId || dims.campaign_id === campaignId) && (!onDay || dims.stat_time_day.startsWith(onDay));
  });
  return Math.round(list.reduce((s, r) => s + Number((r.metrics as Record<string, string>).spend), 0) * 100) / 100;
}

// Realistic month: a traffic campaign whose cost per click rises ~60% in the last
// week, a steady video-views campaign, and a lead-generation campaign. TikTok's
// leads metric is not synced; its `conversion` (the optimization event) carries
// the lead campaign's results, as for TikTok CSV exports.
function month(w: { start: string; end: string }) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 30; i++) {
    const date = day(w.start, i);
    const late = i >= 23;
    const wobble = 1 + ((i * 7) % 5) / 100;
    const m = (o: Record<string, number | string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? v.toFixed(k === "spend" ? 2 : 0) : v]));
    const base = { conversion: 0, complete_payment: 0, app_install: 0, registration: 0, follows: 2, likes: 30, comments: 2, shares: 1 };
    rows.push({ dimensions: { campaign_id: CAMPAIGNS[0]!.id, stat_time_day: `${date} 00:00:00` }, metrics: m({ ...base, campaign_name: CAMPAIGNS[0]!.name, objective_type: "TRAFFIC", campaign_budget: "200000.00", spend: 80000 * wobble, impressions: 60000, clicks: late ? 125 : 200, reach: 41000, total_landing_page_view: late ? 90 : 150, video_play_actions: 30000 }) });
    rows.push({ dimensions: { campaign_id: CAMPAIGNS[1]!.id, stat_time_day: `${date} 00:00:00` }, metrics: m({ ...base, campaign_name: CAMPAIGNS[1]!.name, objective_type: "LEAD_GENERATION", campaign_budget: "-", spend: 50000 * wobble, impressions: 30000, clicks: 150, conversion: 20, reach: 22000, total_landing_page_view: 0, video_play_actions: 12000 }) });
    rows.push({ dimensions: { campaign_id: CAMPAIGNS[2]!.id, stat_time_day: `${date} 00:00:00` }, metrics: m({ ...base, campaign_name: CAMPAIGNS[2]!.name, objective_type: "VIDEO_VIEWS", campaign_budget: "120000.00", spend: 40000 * wobble, impressions: 90000, clicks: 60, reach: 70000, total_landing_page_view: 0, video_play_actions: 45000 }) });
  }
  return rows;
}

describe("TikTok Sync: the analysis journey", () => {
  beforeEach(resetReport);

  it("Sync Now → stored rows → campaign dashboard → insights, in KHR, with missing measures shown as unavailable", async () => {
    const ws = await freshKhr("ws-p5-journey");
    const w = await window();
    tiktok.report = month(w);
    expect((await sync()).outcome).toBe("ok");
    const { loadAnalysisTrusted, loadImportColumns } = await import("@/lib/data/workspaces");
    const { viewModel } = await import("@/lib/analysis/viewModel");
    const a = (await loadAnalysisTrusted(ws.id))!;

    // The default view: the last 7 synced days against the 7 before, in the account's currency.
    expect(a.workspace.currency).toBe("KHR");
    expect(a.selection.b).toEqual({ from: day(w.end, -6), to: w.end });
    const traffic = a.campaigns.find((c) => c.info.name === CAMPAIGNS[0]!.name)!;
    const spendB = sumSpend(tiktok.report.filter((r) => String((r.dimensions as Record<string, string>).stat_time_day) >= day(w.end, -6)), CAMPAIGNS[0]!.id);
    expect(traffic.info.objective).toBe("traffic");
    expect(traffic.b.spend).toBeCloseTo(spendB, 2);
    expect(traffic.kpiB).toBeCloseTo(spendB / (125 * 7), 6); // cost per click from TikTok's destination clicks
    expect(traffic.kpiB! / traffic.kpiA!).toBeGreaterThan(1.4);
    expect(a.campaigns.find((c) => c.info.name === CAMPAIGNS[1]!.name)!.info.objective).toBe("leads");
    expect(a.campaigns.find((c) => c.info.name === CAMPAIGNS[2]!.name)!.info.objective).toBe("video_views");

    // Insights and recommendations come from the unchanged engine.
    expect(a.findings.some((f) => f.campaignName === CAMPAIGNS[0]!.name && f.platform === "tiktok")).toBe(true);
    const v = viewModel(a, a.coverage.dailyFrom!);
    expect(v.levels.campaign.find((r) => r.name === CAMPAIGNS[0]!.name)!.label).toBeTruthy();

    // Missing measures stay missing after storage and read-back: not in the import's
    // columns, not in what the engine trusts, and "—" (null) on the dashboard.
    const columns = [...(await loadImportColumns(ws.id)).values()][0]!;
    for (const k of ["thruplays", "leads", "messages", "conversionValue", "clicksAll", "leadFormOpens"] as const) {
      expect(columns.has(k)).toBe(false);
      for (const c of a.campaigns) expect(c.availB.has(k)).toBe(false);
    }
    for (const c of a.campaigns) expect(c.availB.has("reach")).toBe(false); // 7 daily reaches can't be added up
    for (const r of v.levels.campaign) {
      expect(r.reach).toBeNull();
      expect(r.frequency).toBeNull();
      expect(r.revenue).toBeNull();
    }
    const leads = v.levels.campaign.find((r) => r.name === CAMPAIGNS[1]!.name)!;
    expect(leads.results).toBe(20 * 7); // through TikTok conversions, not the unsynced leads metric
  });

  it("the engine sees exactly the same numbers as an equivalent uploaded export", async () => {
    const w = await window();
    const synced = await freshKhr("ws-p5-same-a");
    tiktok.report = month(w);
    await sync();
    const uploaded = await account(A, "ws-p5-same-b", "KHR");
    const { normalizeTikTokReport } = await import("@/lib/tiktok/report");
    const { commitImport } = await import("@/lib/data/imports");
    const { db: d } = await db();
    const report = normalizeTikTokReport(month(w), w);
    await commitImport(d, { workspaceId: uploaded.id, fileName: "same.csv", platform: "tiktok", level: "campaign", granularity: "daily", period: report.period!, currency: "KHR", attribution: null, warnings: [], columns: report.columns, rows: report.rows });
    const { loadAnalysisTrusted } = await import("@/lib/data/workspaces");
    const strip = async (id: string) => {
      const a = (await loadAnalysisTrusted(id))!;
      return {
        campaigns: a.campaigns.map((c) => [c.info.name, c.mode, c.kpiA, c.kpiB, c.verdict, c.confidence, [...c.availB].sort()]).sort(),
        findings: a.findings.map((f) => [f.detector, f.campaignName, f.priority, f.confidence, f.title]).sort(),
        objectives: a.objectives.map((o) => [o.objective, o.kpiA, o.kpiB, o.kpiMissing]),
      };
    };
    expect(await strip(synced.id)).toEqual(await strip(uploaded.id));
  });

});

describe("TikTok Sync: lock, retries and time limits (ready for scheduled jobs)", () => {
  beforeEach(resetReport);

  it("a run that lost its lock writes nothing and cannot release the new holder's lock", async () => {
    const ws = await freshKhr("ws-p5-lock");
    const w = await window();
    tiktok.report = simulate([w.end]);
    const { db: d, schema, eq } = await db();
    // While this run is reading, its lock expires and another run takes over.
    tiktok.onReport = async () => {
      await d.update(schema.tiktokSyncs).set({ lockToken: "other-run", lockedUntil: new Date(Date.now() + 3_600_000) }).where(eq(schema.tiktokSyncs.workspaceId, ws.id));
    };
    await expect(sync()).rejects.toMatchObject({ code: "busy" });
    expect(await activeFacts(ws.id)).toHaveLength(0);
    expect(await d.select().from(schema.tiktokSyncImports).where(eq(schema.tiktokSyncImports.workspaceId, ws.id))).toHaveLength(0);
    const [row] = await d.select().from(schema.tiktokSyncs).where(eq(schema.tiktokSyncs.workspaceId, ws.id));
    expect(row).toMatchObject({ lockToken: "other-run" }); // not cleared by the losing run
  });

  it("a crashed run's lock expires, so the account is never stuck", async () => {
    const ws = await freshKhr("ws-p5-crash");
    const w = await window();
    const { db: d, schema } = await db();
    await d.insert(schema.tiktokSyncs).values({ workspaceId: ws.id, userId: A, advertiserId: ADVERTISER, lockToken: "crashed", lockedUntil: new Date(clock - 1000), startedAt: new Date(clock - 11 * 60_000) });
    tiktok.report = simulate([w.end]);
    expect((await sync()).outcome).toBe("ok");
  });

  it("retries temporary TikTok failures on a page, but not permanent ones", async () => {
    await freshKhr("ws-p5-retry");
    const w = await window();
    tiktok.report = simulate([w.end]);
    tiktok.failPage = 1;
    tiktok.failTimes = 2; // rate-limited twice, then fine
    tiktok.failCode = 40100;
    expect((await sync()).outcome).toBe("ok");
    expect(tiktok.reportCalls.map((c) => c.page)).toEqual([1, 1, 1]);

    resetReport();
    tiktok.report = simulate([day(w.end, -1)]);
    tiktok.failPage = 1;
    tiktok.failCode = 40002; // a bad request: final
    await expect(sync()).rejects.toMatchObject({ code: "provider" });
    expect(tiktok.reportCalls).toHaveLength(1);
  });

  it("stops at the time budget without writing, and frees the lock", async () => {
    const ws = await freshKhr("ws-p5-timeout");
    const w = await window();
    const many = Array.from({ length: 400 }, (_, i) => ({ id: String(1840000000000000 + i), name: `KH | Slow ${i}`, objective: "TRAFFIC", budget: "-" }));
    tiktok.report = simulate([day(w.end, -2), day(w.end, -1), w.end], many); // 2 pages
    const { syncTikTokAdvertiser } = await import("@/lib/tiktok/sync");
    let t = later().getTime();
    tiktok.onReport = async () => {
      t += 3 * 60_000; // each page takes 3 minutes
    };
    await expect(syncTikTokAdvertiser(A, ADVERTISER, { now: () => new Date(t), sleep: async () => {} })).rejects.toMatchObject({ code: "timeout" });
    expect(await activeFacts(ws.id)).toHaveLength(0);
    const { tikTokSyncStatus } = await import("@/lib/tiktok/sync");
    expect((await tikTokSyncStatus(A)).find((s) => s.workspaceId === ws.id)).toMatchObject({ running: false, outcome: "failed", errorCode: "timeout" });
  });

  it("refreshes an access token that would expire during the run before reading", async () => {
    await freshKhr("ws-p5-token");
    const at = new Date(); // real time: the token's expiry is compared with it
    const { syncWindow } = await import("@/lib/tiktok/report");
    const w = syncWindow("Asia/Phnom_Penh", at);
    const { db: d, schema, eq } = await db();
    // Valid for 6 more minutes: enough for a page view (5-minute margin), not for a sync run.
    await d.update(schema.tiktokConnections).set({ accessExpiresAt: new Date(at.getTime() + 6 * 60_000) }).where(eq(schema.tiktokConnections.userId, A));
    const refreshes = tiktok.refreshes;
    tiktok.report = simulate([w.end]);
    const { syncTikTokAdvertiser } = await import("@/lib/tiktok/sync");
    expect((await syncTikTokAdvertiser(A, ADVERTISER, { now: () => at, sleep: async () => {} })).outcome).toBe("ok");
    expect(tiktok.refreshes).toBe(refreshes + 1);
  });
});

// ---- Phase 6: rolling sync history ------------------------------------------
const P6 = [
  { id: CAMPAIGNS[0]!.id, name: CAMPAIGNS[0]!.name, objective: "TRAFFIC", spend: 60000 },
  { id: CAMPAIGNS[2]!.id, name: CAMPAIGNS[2]!.name, objective: "VIDEO_VIEWS", spend: 35000 },
  { id: "1850000000000001", name: "KH | Late starter", objective: "TRAFFIC", spend: 20000, from: 40 },
  { id: "1850000000000002", name: "KH | Ended early", objective: "REACH", spend: 15000, to: 25 },
];
const dayIndex = (origin: string, d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / 86400000);
/**
 * TikTok as it behaves over months: each report covers the asked dates, the
 * newest 3 days are still being revised (they grow on later syncs), campaigns
 * start and stop, and some measures go missing for a while ("-" for reach on
 * syncs 30–39, for likes on syncs 50–55).
 */
function months(origin: string, syncNo: () => number) {
  return (start: string, end: string) => {
    const n = syncNo();
    const rows: Record<string, unknown>[] = [];
    for (let d = start; d <= end; d = day(d, 1)) {
      const idx = dayIndex(origin, d);
      const age = dayIndex(d, end);
      const revise = age < 3 ? 0.97 + 0.01 * age : 1;
      for (const c of P6) {
        if ((c.from !== undefined && idx < c.from) || (c.to !== undefined && idx > c.to)) continue;
        const spend = (c.spend + (idx % 7) * 900) * revise;
        rows.push({
          dimensions: { campaign_id: c.id, stat_time_day: `${d} 00:00:00` },
          metrics: {
            campaign_name: c.name, objective_type: c.objective, campaign_budget: "-",
            spend: spend.toFixed(2), impressions: String(Math.round(spend * 0.8)), clicks: String(Math.round((spend / 400) * (idx > 60 && c.objective === "TRAFFIC" ? 0.7 : 1))),
            reach: n >= 30 && n < 40 ? "-" : String(Math.round(spend * 0.5)), conversion: "0", complete_payment: "0", app_install: "0", registration: "0",
            total_landing_page_view: String(Math.round(spend / 600)), video_play_actions: String(Math.round(spend * 0.4)), follows: "2",
            likes: n >= 50 && n < 56 ? "-" : "30", comments: "2", shares: "1",
          },
        });
      }
    }
    return rows;
  };
}
async function connectAs(person: "a" | "b") {
  await signIn(person);
  await callback((await start()).state);
  const { db: d, schema, eq } = await db();
  const far = new Date(Date.now() + 500 * 86400000); // the simulated months stay inside the authorization
  await d.update(schema.tiktokConnections).set({ accessExpiresAt: far, refreshExpiresAt: far }).where(eq(schema.tiktokConnections.userId, PEOPLE[`${person}.jwt.sig`]!.id));
}
async function linkTo(user: string, workspaceId: string) {
  const { linkTikTokAdvertiser } = await import("@/lib/tiktok/service");
  await linkTikTokAdvertiser(user, ADVERTISER, workspaceId);
}
const syncAs = async (user: string, at: Date, keepRecentSyncs?: number) =>
  (await import("@/lib/tiktok/sync")).syncTikTokAdvertiser(user, ADVERTISER, { now: () => at, sleep: async () => {}, keepRecentSyncs });
/** Every active row as the analysis reads it, by campaign name (ids differ between accounts). */
async function activeRows(workspaceId: string) {
  const { db: d, schema } = await db();
  const { and, eq } = await import("drizzle-orm");
  const { MEASURE_KEYS } = await import("@/lib/metrics/measures");
  const rows = await d
    .select({ f: schema.facts, name: schema.entities.name })
    .from(schema.facts)
    .innerJoin(schema.entities, eq(schema.entities.id, schema.facts.campaignId))
    .where(and(eq(schema.facts.workspaceId, workspaceId), eq(schema.facts.active, true)));
  return rows.map(({ f, name }) => [name, f.platform, f.granularity, f.periodStart, f.periodEnd, ...MEASURE_KEYS.map((k) => Math.round(Number(f[k]) * 100) / 100)].join("|")).sort();
}
/** What the dashboard shows for a period: KPIs, verdicts, availability, findings, plans. */
async function analysisDigest(workspaceId: string, params: Record<string, string> = {}) {
  const { loadAnalysisTrusted } = await import("@/lib/data/workspaces");
  const { viewModel } = await import("@/lib/analysis/viewModel");
  const a = await loadAnalysisTrusted(workspaceId, params);
  if (!a) return null;
  const v = viewModel(a, a.coverage.dailyFrom ?? a.coverage.minDate ?? a.selection.b.from);
  return {
    selection: [a.selection.b, a.selection.a],
    campaigns: a.campaigns.map((c) => [c.info.name, c.mode, c.kpiA, c.kpiB, c.verdict, c.confidence, [...c.availB].sort()]).sort(),
    findings: a.findings.map((f) => [f.detector, f.campaignName, f.priority, f.confidence, f.title, f.dataBasis]).sort(),
    objectives: a.objectives.map((o) => [o.objective, o.kpiA, o.kpiB, o.kpiMissing]),
    rows: v.levels.campaign.map((r) => [r.name, r.spend, r.results, r.reach, r.revenue, r.kpi, r.label]).sort(),
  };
}
async function importsOf(workspaceId: string) {
  const { db: d, schema, eq } = await db();
  return d.select().from(schema.imports).where(eq(schema.imports.workspaceId, workspaceId));
}

describe("TikTok Sync: rolling history", () => {
  beforeEach(resetReport);

  it("90 daily syncs with uploads in between: same data, comparisons and insights as keeping every sync", async () => {
    await connectAs("b");
    await connectAs("a");
    const wsA = await account(A, "ws-p6-rolling", "KHR"); // rolling history (keeps 7)
    const wsB = await account(B, "ws-p6-reference", "KHR"); // reference: never consolidates
    await linkTo(A, wsA.id);
    await linkTo(B, wsB.id);
    const base = Date.now();
    const at = (i: number) => new Date(base + i * 86400000);
    const { syncWindow } = await import("@/lib/tiktok/report");
    const origin = syncWindow("Asia/Phnom_Penh", at(0)).start;
    let n = 0;
    tiktok.reportFn = months(origin, () => n);
    const both = async (fn: (ws: string) => Promise<unknown>) => {
      await fn(wsA.id);
      await fn(wsB.id);
    };
    const same = async (label: string) => {
      expect(await activeRows(wsA.id), label).toEqual(await activeRows(wsB.id));
      const periods: Record<string, string>[] = [{}, { from: day(origin, 10), to: day(origin, 16), cmp: "previous" }, { from: day(origin, 40), to: day(origin, 69), cmp: "previous" }];
      for (const params of periods) {
        expect(await analysisDigest(wsA.id, params), `${label} ${JSON.stringify(params)}`).toEqual(await analysisDigest(wsB.id, params));
      }
    };

    let ok = 0;
    for (n = 0; n < 90; n++) {
      const w = syncWindow("Asia/Phnom_Penh", at(n));
      const ra = await syncAs(A, at(n));
      const rb = await syncAs(B, at(n), Number.POSITIVE_INFINITY);
      expect([ra.outcome, rb.outcome]).toEqual(["ok", "ok"]);
      expect(ra.rows).toBe(rb.rows);
      ok++;
      if (n === 20) await both((ws) => upload(ws, "tiktok", Array.from({ length: 10 }, (_, i) => ({ campaign: "KH | CSV only", date: day(w.start, 10 + i), spend: 1111 })), "csv-only.csv"));
      if (n === 45) await both((ws) => upload(ws, "tiktok", [{ campaign: P6[0]!.name, campaignId: P6[0]!.id, from: day(w.start, -5), to: day(w.start, 3), spend: 77_777 }], "summary.csv"));
      if (n === 70) await both((ws) => upload(ws, "tiktok", [day(w.end, -2), day(w.end, -1), w.end].map((date) => ({ campaign: P6[0]!.name, campaignId: P6[0]!.id, date, spend: 4242 })), "late-daily.csv"));
      if (n === 29 || n === 59) await same(`after ${n + 1} syncs`);
    }
    await same("after 90 syncs");

    // Only the 7 newest syncs stay undoable; the rest are history; the reference keeps all 90.
    const syncs = async (ws: string) => (await import("@/lib/tiktok/history")).syncImportsOf(ws);
    const syncA = await syncs(wsA.id);
    const impA = (await importsOf(wsA.id)).filter((i) => syncA.has(i.id));
    expect(impA.filter((i) => i.status === "active")).toHaveLength(7);
    expect(impA.filter((i) => i.status === "history")).toHaveLength(ok - 7);
    expect((await importsOf(wsB.id)).filter((i) => i.status === "active")).toHaveLength(ok + 3);
    // History rows keep their own measure sets (reach missing on syncs 30–39, likes on 50–55).
    const columnSets = new Set(impA.map((i) => JSON.stringify(i.columns)));
    expect(columnSets.size).toBe(3);
    // Storage stays bounded: far fewer replaced copies than keeping every sync.
    const { db: d, schema } = await db();
    const { and, eq } = await import("drizzle-orm");
    const inactive = async (ws: string) => (await d.select({ id: schema.facts.id }).from(schema.facts).where(and(eq(schema.facts.workspaceId, ws), eq(schema.facts.active, false)))).length;
    expect(await inactive(wsA.id)).toBeLessThan((await inactive(wsB.id)) / 5);

    // Undo still works on the recent imports and uploads, identically to the reference.
    const { undoImport } = await import("@/lib/data/imports");
    const newest = async (ws: string, skip = 0) => {
      const s = await syncs(ws);
      return (await importsOf(ws)).filter((i) => s.has(i.id) && i.status === "active").sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[skip]!.id;
    };
    const file = async (ws: string, name: string) => (await importsOf(ws)).find((i) => i.fileName === name)!.id;
    await both(async (ws) => undoImport(d, ws, await newest(ws)));
    await same("after undoing the newest sync");
    await both(async (ws) => undoImport(d, ws, await newest(ws, 2)));
    await same("after undoing an older recent sync");
    await both(async (ws) => undoImport(d, ws, await file(ws, "late-daily.csv")));
    await same("after undoing a recent upload");
    await both(async (ws) => undoImport(d, ws, await file(ws, "summary.csv")));
    await same("after undoing an upload older than the history");

    // A history sync can't be undone: nothing changes.
    const before = await activeRows(wsA.id);
    const old = impA.find((i) => i.status === "history")!;
    await undoImport(d, wsA.id, old.id);
    expect(await activeRows(wsA.id)).toEqual(before);
    expect((await importsOf(wsA.id)).find((i) => i.id === old.id)!.status).toBe("history");
  }, 240_000 * SLOW);

  it("syncs never use up the upload allowance; uploads keep their limit", async () => {
    await connectAs("a");
    const ws = await account(A, "ws-p6-limit", "KHR");
    await linkTo(A, ws.id);
    const base = Date.now();
    const { syncWindow } = await import("@/lib/tiktok/report");
    tiktok.reportFn = months(syncWindow("Asia/Phnom_Penh", new Date(base)).start, () => 0);
    for (let i = 0; i < 12; i++) expect((await syncAs(A, new Date(base + i * 86400000))).outcome).toBe("ok");
    const { checkImportLimit, LIMITS } = await import("@/lib/integration/limits");
    expect(await checkImportLimit(ws.id)).toBeNull();
    const { db: d, schema } = await db();
    // Fill the upload allowance with uploads (bare rows are enough for the count).
    await d.insert(schema.imports).values(Array.from({ length: LIMITS.importsPerAccount }, (_, i) => ({
      id: `p6-upload-${i}`, workspaceId: ws.id, platform: "meta", fileName: `u${i}.csv`, level: "campaign", granularity: "daily", periodStart: "2026-01-01", periodEnd: "2026-01-01", rowCount: 0,
    })));
    expect(await checkImportLimit(ws.id)).toMatch(/already has 50 reports/);
    // …and TikTok still syncs.
    expect((await syncAs(A, new Date(base + 12 * 86400000))).outcome).toBe("ok");
  });

  it("a failure during consolidation rolls the whole sync back", async () => {
    await connectAs("a");
    const ws = await account(A, "ws-p6-rollback", "KHR");
    await linkTo(A, ws.id);
    const base = Date.now();
    const { syncWindow } = await import("@/lib/tiktok/report");
    tiktok.reportFn = months(syncWindow("Asia/Phnom_Penh", new Date(base)).start, () => 0);
    // 8 syncs: the 9th retires the 2nd, whose replaced copies (of the 1st) it then deletes.
    for (let i = 0; i < 8; i++) await syncAs(A, new Date(base + i * 86400000));
    const { db: d, schema, eq } = await db();
    const state = async () => ({
      imports: (await importsOf(ws.id)).map((i) => [i.id, i.status]).sort(),
      facts: (await d.select().from(schema.facts).where(eq(schema.facts.workspaceId, ws.id))).map((f) => [f.id, f.active, f.replacedBy]).sort(),
      syncImports: (await d.select().from(schema.tiktokSyncImports).where(eq(schema.tiktokSyncImports.workspaceId, ws.id))).length,
      entities: (await d.select().from(schema.entities).where(eq(schema.entities.workspaceId, ws.id))).length,
    });
    const before = await state();
    // The database refuses the clean-up step of the 9th sync.
    await d.execute(`create or replace function p6_refuse() returns trigger language plpgsql as $$ begin raise exception 'refused for test'; end $$;`);
    await d.execute(`create trigger p6_refuse before delete on facts for each row when (old.workspace_id = 'ws-p6-rollback') execute function p6_refuse();`);
    await expect(syncAs(A, new Date(base + 8 * 86400000))).rejects.toMatchObject({ code: "storage" });
    expect(await state()).toEqual(before); // no import, no status change, no replaced rows, no new entities
    const [row] = await d.select().from(schema.tiktokSyncs).where(eq(schema.tiktokSyncs.workspaceId, ws.id));
    expect(row).toMatchObject({ outcome: "failed", errorCode: "storage", lockToken: null, lockedUntil: null });
    await d.execute(`drop trigger p6_refuse on facts`);
    await d.execute(`drop function p6_refuse()`);
    const after = await syncAs(A, new Date(base + 9 * 86400000));
    expect(after).toMatchObject({ outcome: "ok", history: { retired: 1 } });
    expect(after.history!.pruned).toBeGreaterThan(0);
  });

  it("consolidation only ever touches the syncing person's account and advertiser", async () => {
    await connectAs("b");
    await connectAs("a");
    const wsA = await account(A, "ws-p6-iso-a", "KHR");
    const wsB = await account(B, "ws-p6-iso-b", "KHR");
    await linkTo(A, wsA.id);
    await linkTo(B, wsB.id);
    const base = Date.now();
    const { syncWindow } = await import("@/lib/tiktok/report");
    tiktok.reportFn = months(syncWindow("Asia/Phnom_Penh", new Date(base)).start, () => 0);
    for (let i = 0; i < 9; i++) await syncAs(B, new Date(base + i * 86400000));
    const bUpload = await upload(wsB.id, "tiktok", [{ campaign: "B | CSV", date: day(syncWindow("Asia/Phnom_Penh", new Date(base)).end, -1), spend: 5 }], "b.csv");
    // A's account holds syncs of another (previously linked) advertiser: never retired by this advertiser's syncs.
    const { db: d, schema } = await db();
    const other: string[] = [];
    for (let i = 0; i < 9; i++) other.push((await upload(wsA.id, "tiktok", [{ campaign: `Old advertiser ${i}`, date: "2026-01-01", spend: 1 }], `old-${i}.csv`)).importId);
    await d.insert(schema.tiktokSyncImports).values(other.map((importId) => ({ importId, workspaceId: wsA.id, advertiserId: "7000000000999", windowStart: "2025-12-03", windowEnd: "2026-01-01" })));
    // A forged record claiming B's upload as a sync of A's account.
    await d.insert(schema.tiktokSyncImports).values({ importId: bUpload.importId, workspaceId: wsA.id, advertiserId: ADVERTISER, windowStart: "2026-01-01", windowEnd: "2026-01-30" });
    const bBefore = { imports: (await importsOf(wsB.id)).map((i) => [i.id, i.status]).sort(), rows: await activeRows(wsB.id) };

    for (let i = 0; i < 10; i++) expect((await syncAs(A, new Date(base + (20 + i) * 86400000))).outcome).toBe("ok");

    expect({ imports: (await importsOf(wsB.id)).map((i) => [i.id, i.status]).sort(), rows: await activeRows(wsB.id) }).toEqual(bBefore);
    const aImports = await importsOf(wsA.id);
    expect(aImports.filter((i) => other.includes(i.id)).every((i) => i.status === "active")).toBe(true);
    const { syncImportsOf } = await import("@/lib/tiktok/history");
    expect((await syncImportsOf(wsA.id)).has(bUpload.importId)).toBe(false);
    // B's own history is B's: 9 syncs → 2 retired, done by B's syncs only.
    expect((await importsOf(wsB.id)).filter((i) => i.status === "history")).toHaveLength(2);
  });

  it("shows KHR everywhere money appears, without changing any number", async () => {
    const { makeFmt } = await import("@/lib/fmt5");
    const khr = makeFmt("KHR");
    const usd = makeFmt("USD");
    const plain = (x: string) => x.replace(/\u00a0/g, " "); // Intl puts a no-break space after "KHR"
    expect([khr.money(653.8), khr.money(41000), khr.money(0.5), khr.back(2.5), khr.one].map(plain)).toEqual(["KHR 654", "KHR 41,000", "KHR 0.50", "KHR 2.50", "KHR 1"]);
    expect([usd.back(2.5), usd.one]).toEqual(["$2.50", "$1"]); // the USD wording is unchanged

    const ws = await freshKhr("ws-p6-khr");
    const w = await window();
    tiktok.report = month(w);
    await sync();
    const { loadAnalysisTrusted } = await import("@/lib/data/workspaces");
    const a = (await loadAnalysisTrusted(ws.id))!;
    const texts = a.findings.flatMap((f) => [f.title, f.whatHappened, f.rule, f.dataBasis, f.action, ...f.evidence.flatMap((e) => [e.a, e.b])]).filter(Boolean).join("\n");
    expect(texts).toMatch(/KHR/);
    expect(texts).not.toMatch(/\$/);
    const { accountMessage } = await import("@/lib/telegram");
    const m = (await accountMessage(ws.id))!;
    const msg = [m.text, ...m.lines.map((l) => JSON.stringify(l))].join("\n");
    expect(msg).not.toMatch(/\$\d/);
    expect(msg).toMatch(/KHR/);
  });
});

// ---- Phase 7: concurrent uploads, undo and syncing --------------------------
describe("Concurrent uploads, undo and TikTok syncing on one account", () => {
  beforeEach(resetReport);

  it("always ends exactly as if the three had run one after another", async () => {
    await connectAs("a");
    const base = Date.now();
    const { syncWindow } = await import("@/lib/tiktok/report");
    const w = syncWindow("Asia/Phnom_Penh", new Date(base));
    const [d1, d2, d3, d4] = [day(w.end, -3), day(w.end, -2), day(w.end, -1), w.end];
    const T = P6[0]!;
    const { db: d } = await db();
    const { undoImport } = await import("@/lib/data/imports");
    let version = 0; // the TikTok numbers revise between the first and second sync
    tiktok.reportFn = (start, end) =>
      simulate([d1, d2, d3, d4].filter((x) => x >= start && x <= end && (version > 0 || x !== d4)), CAMPAIGNS, version > 0 ? 1.25 : 1);

    // Same starting point in every account: one sync, then an upload of T on d2–d3.
    let n = 0;
    async function prepared() {
      const ws = await account(A, `ws-p7-${n++}`, "KHR");
      await linkTo(A, ws.id);
      version = 0;
      await syncAs(A, new Date(base));
      const first = await upload(ws.id, "tiktok", [d2, d3].map((date) => ({ campaign: T.name, campaignId: T.id, date, spend: 500 })), "first.csv");
      version = 1;
      return { ws: ws.id, first: first.importId };
    }
    const ops = {
      upload: (ws: string) => upload(ws, "tiktok", [d3, d4].map((date) => ({ campaign: T.name, campaignId: T.id, date, spend: 900 })), "second.csv"),
      undo: (ws: string, first: string) => undoImport(d, ws, first),
      sync: () => syncAs(A, new Date(base + 2 * 60_000)),
    };
    type Op = keyof typeof ops;
    const run = (op: Op, ws: string, first: string) => (op === "sync" ? ops.sync() : op === "undo" ? ops.undo(ws, first) : ops.upload(ws));

    // Every one-after-another order.
    const orders: Op[][] = [["upload", "undo", "sync"], ["upload", "sync", "undo"], ["undo", "upload", "sync"], ["undo", "sync", "upload"], ["sync", "upload", "undo"], ["sync", "undo", "upload"]];
    const outcomes = new Map<string, string>();
    for (const order of orders) {
      const { ws, first } = await prepared();
      for (const op of order) await run(op, ws, first);
      outcomes.set(JSON.stringify(await activeRows(ws)), order.join(" → "));
    }
    expect(outcomes.size).toBeGreaterThan(1); // the order matters, so the check below means something

    // Now all three at once, with varying timing inside the sync.
    for (let round = 0; round < 8; round++) {
      const { ws, first } = await prepared();
      tiktok.onReport = () => new Promise((r) => setTimeout(r, (round * 7) % 25));
      const results = await Promise.allSettled([ops.upload(ws), ops.undo(ws, first), ops.sync()]);
      tiktok.onReport = null;
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
      const rows = JSON.stringify(await activeRows(ws));
      expect(outcomes.has(rows), `round ${round}: not equal to any one-after-another order`).toBe(true);

      // Nothing hidden by, or left from, an undone import; the sync lock is free.
      const { schema } = await db();
      const { and, eq, inArray } = await import("drizzle-orm");
      const undone = (await d.select({ id: schema.imports.id }).from(schema.imports).where(and(eq(schema.imports.workspaceId, ws), eq(schema.imports.status, "undone")))).map((x) => x.id);
      if (undone.length) {
        expect(await d.select().from(schema.facts).where(inArray(schema.facts.importId, undone))).toHaveLength(0);
        expect(await d.select().from(schema.facts).where(inArray(schema.facts.replacedBy, undone))).toHaveLength(0);
      }
      const [lock] = await d.select().from(schema.tiktokSyncs).where(eq(schema.tiktokSyncs.workspaceId, ws));
      expect(lock).toMatchObject({ lockToken: null, lockedUntil: null, outcome: "ok" });
    }
  }, 120_000 * SLOW);
});

// ---- Phase 7c: a background run cut off by the platform ---------------------
describe("Sync Now when the background run is cut off", () => {
  beforeEach(resetReport);

  it("shows the run as interrupted once its lock runs out, then a new sync works", async () => {
    const ws = await freshKhr("ws-p7c-cutoff");
    const w = await window();
    tiktok.report = simulate([w.end]);
    const { startTikTokSync, tikTokSyncStatus } = await import("@/lib/tiktok/sync");
    const { SYNC_LOCK_MS } = await import("@/lib/tiktok/store");
    const at = later();
    // The route answered "started", then the platform stopped the function before
    // the background part ran (the same as a crash in the middle: no outcome is recorded).
    await startTikTokSync(A, ADVERTISER, { now: () => at, sleep: async () => {} });
    const statusAt = async (ms: number) => (await tikTokSyncStatus(A, new Date(at.getTime() + ms))).find((s) => s.workspaceId === ws.id)!;

    expect(await statusAt(60_000)).toMatchObject({ running: true, interrupted: false });
    // Meanwhile another click is refused instead of running twice.
    await expect(startTikTokSync(A, ADVERTISER, { now: () => new Date(at.getTime() + 60_000) })).rejects.toMatchObject({ code: "busy" });
    // The lock outlives Vercel's 300-second limit, then frees itself.
    expect(SYNC_LOCK_MS).toBeGreaterThan(300_000);
    expect(await statusAt(SYNC_LOCK_MS + 1_000)).toMatchObject({ running: false, interrupted: true });
    expect(await activeFacts(ws.id)).toHaveLength(0); // nothing was half-written

    // Pressing Sync now again works and clears the interrupted state.
    const again = new Date(at.getTime() + SYNC_LOCK_MS + 2_000);
    const job = await startTikTokSync(A, ADVERTISER, { now: () => again, sleep: async () => {} });
    expect((await job.run()).outcome).toBe("ok");
    expect(await statusAt(SYNC_LOCK_MS + 3_000)).toMatchObject({ running: false, interrupted: false, outcome: "ok" });
  });
});

// ---- Self-service staging beta (lib/tiktok/beta.ts) --------------------------
// No allowlist: anyone signed in with a confirmed email may connect, with a
// consent notice, switches and per-person limits. Never on production.
describe("TikTok self-service beta", () => {
  const BETA_ENV = ["TIKTOK_CONNECT_ACCESS", "TIKTOK_BETA_CONNECTIONS", "TIKTOK_BETA_MAX_CONNECTIONS", "ADMATE_NEW_SIGNUPS", "ADMATE_MAX_USERS", "VERCEL_ENV"];
  beforeEach(() => {
    process.env.TIKTOK_CONNECT_ACCESS = "open-beta";
    delete process.env.TIKTOK_CONNECT_ALLOWED_USER_IDS; // nobody on an allowlist
  });
  afterEach(() => BETA_ENV.forEach((k) => delete process.env[k]));

  const bridge = async (token: string) => {
    jar = new Map();
    const { POST } = await import("@/app/api/session/route");
    return POST(new Request(`${ORIGIN}/app/api/session`, { method: "POST", headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", authorization: `Bearer ${token}` } }));
  };
  const betaStart = async (consent: boolean | undefined) => {
    const { POST } = await import("@/app/api/tiktok/oauth/start/route");
    const res = await POST(req("/api/tiktok/oauth/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent }) }));
    if (res.status !== 200) return { status: res.status, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? null, state: "" };
    const url = new URL((await res.json()).url);
    const state = url.searchParams.get("state")!;
    tiktok.challenges.set(state, url.searchParams.get("code_challenge")!);
    return { status: 200, error: null, state };
  };

  it("is only a staging mode: never on Vercel Production, never on admate.site", async () => {
    const { isTikTokConnectionEnabled, isTikTokUserAllowed, tiktokAccessMode } = await import("@/lib/tiktok/config");
    const env = (extra: Record<string, string> = {}) => ({ TIKTOK_CONNECT_ENABLED: "true", TIKTOK_CONNECT_ACCESS: "open-beta", ADMATE_PUBLIC_ORIGIN: "https://admate-tiktok-staging.vercel.app", ...extra }) as unknown as NodeJS.ProcessEnv;
    const staging = env();
    expect(tiktokAccessMode(staging)).toBe("open-beta");
    expect(isTikTokUserAllowed(C, staging)).toBe(true);
    // The same settings on the production address fall back to the (empty) allowlist.
    for (const origin of ["https://www.admate.site", "https://admate.site", "https://admate-tiktok-staging.vercel.app.evil.example"]) {
      expect(tiktokAccessMode(env({ ADMATE_PUBLIC_ORIGIN: origin }))).toBe("allowlist");
      expect(isTikTokUserAllowed(C, env({ ADMATE_PUBLIC_ORIGIN: origin }))).toBe(false);
    }
    // A Vercel Production deployment: TikTok is off entirely, whatever else is set.
    expect(isTikTokConnectionEnabled(env({ VERCEL_ENV: "production" }))).toBe(false);
    expect(isTikTokUserAllowed(C, env({ VERCEL_ENV: "production", TIKTOK_CONNECT_ALLOWED_USER_IDS: C }))).toBe(false);
    await signIn("c");
    process.env.VERCEL_ENV = "production";
    const status = await import("@/app/api/tiktok/connection/route");
    expect((await status.GET()).status).toBe(404);
    expect((await betaStart(true)).status).toBe(404);
  });

  it("admits only confirmed emails, and the sign-up switches stop new people but not existing ones", async () => {
    expect(await (await bridge("d.jwt.sig")).json()).toEqual({ error: "email_unverified" });
    expect((await bridge("a.jwt.sig")).status).toBe(200); // A is known from here on
    process.env.ADMATE_NEW_SIGNUPS = "closed";
    const closed = await bridge("f.jwt.sig");
    expect(closed.status).toBe(403);
    expect(await closed.json()).toEqual({ error: "signups_closed" });
    expect((await bridge("a.jwt.sig")).status).toBe(200); // existing person
    delete process.env.ADMATE_NEW_SIGNUPS;
    process.env.ADMATE_MAX_USERS = "1";
    expect((await bridge("f.jwt.sig")).status).toBe(403);
    delete process.env.ADMATE_MAX_USERS;
    expect((await bridge("f.jwt.sig")).status).toBe(200);
  });

  it("lets a self-registered person connect without an allowlist, only after accepting the notice", async () => {
    await signIn("c");
    expect(await betaStart(undefined)).toMatchObject({ status: 400, error: "consent" });
    expect(await betaStart(false)).toMatchObject({ status: 400, error: "consent" });
    const { state } = await betaStart(true);
    expect(await callback(state)).toEqual({ status: 303, result: "connected" });
    const status = await import("@/app/api/tiktok/connection/route");
    expect(await (await status.GET()).json()).toMatchObject({ connected: true });
    // Outside the beta the same person is refused again (no allowlist entry).
    delete process.env.TIKTOK_CONNECT_ACCESS;
    expect((await status.GET()).status).toBe(403);
  });

  it("limits authorization starts per person, can pause new connections, and caps the beta's places", async () => {
    await signIn("e");
    for (let i = 0; i < 5; i++) expect((await betaStart(true)).status).toBe(200);
    expect(await betaStart(true)).toMatchObject({ status: 429, error: "connect_limit" });
    await signIn("g");
    process.env.TIKTOK_BETA_CONNECTIONS = "closed";
    expect(await betaStart(true)).toMatchObject({ status: 403, error: "connect_closed" });
    delete process.env.TIKTOK_BETA_CONNECTIONS;
    process.env.TIKTOK_BETA_MAX_CONNECTIONS = "0";
    expect(await betaStart(true)).toMatchObject({ status: 403, error: "beta_full" });
    // Someone who already holds a connection can still reconnect.
    await signIn("c");
    expect((await betaStart(true)).status).toBe(200);
  });

  it("creates the person's own account in the advertiser's currency and links it; nothing for advertisers they didn't authorize", async () => {
    await signIn("f");
    await callback((await betaStart(true)).state);
    tiktok.currency = "KHR";
    const { POST } = await import("@/app/api/tiktok/advertisers/route");
    const create = (advertiserId: string) => POST(req("/api/tiktok/advertisers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ advertiserId, createAccount: true }) }));
    const res = await create(ADVERTISER);
    expect(res.status).toBe(200);
    const { workspaceId } = await res.json();
    const { db: d, schema, eq } = await db();
    const [ws] = await d.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    expect(ws).toMatchObject({ ownerId: F, currency: "KHR", isSample: false });
    const links = await d.select().from(schema.tiktokAdvertiserLinks).where(eq(schema.tiktokAdvertiserLinks.userId, F));
    expect(links).toEqual([expect.objectContaining({ advertiserId: ADVERTISER, workspaceId })]);
    const other = await create("7999999999999");
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: "advertiser" });
    // Another person's session never reaches F's account.
    await signIn("c");
    const { getWorkspace } = await import("@/lib/data/workspaces");
    expect(await getWorkspace(workspaceId)).toBeNull();
  });

  it("limits Sync Now per person (6 an hour), before any TikTok call", async () => {
    resetReport();
    await signIn("g");
    await callback((await betaStart(true)).state);
    tiktok.currency = "KHR";
    const ws = await account(G, "ws-g-beta", "KHR");
    await (await import("@/lib/tiktok/service")).linkTikTokAdvertiser(G, ADVERTISER, ws.id);
    tiktok.report = simulate([(await window()).end], CAMPAIGNS, 0.9);
    const { syncTikTokAdvertiser } = await import("@/lib/tiktok/sync");
    for (let i = 0; i < 6; i++) {
      const at = later();
      expect((await syncTikTokAdvertiser(G, ADVERTISER, { now: () => at, sleep: noWait })).outcome).toMatch(/ok|unchanged/);
    }
    const calls = tiktok.reportCalls.length;
    const at = later();
    await expect(syncTikTokAdvertiser(G, ADVERTISER, { now: () => at, sleep: noWait })).rejects.toMatchObject({ code: "sync_limit" });
    expect(tiktok.reportCalls.length).toBe(calls);
    // An hour later it may sync again.
    const next = new Date(at.getTime() + 61 * 60_000);
    clock = next.getTime();
    expect((await syncTikTokAdvertiser(G, ADVERTISER, { now: () => next, sleep: noWait })).outcome).toMatch(/ok|unchanged/);
  });
});
