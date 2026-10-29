// TikTok MCP multi-user connection (lib/tiktok/, app/api/tiktok/*): authorization,
// replay, session binding, rotation, tenant isolation and denial cases. Embedded
// database, fake Supabase Auth and a fake TikTok; no network, no real tokens.
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
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
  currency: "USD",
  // Simulated campaign-by-day report: every row TikTok would hold, served page by page.
  report: [] as Record<string, unknown>[],
  reportCalls: [] as Record<string, unknown>[],
  failPage: 0, // answer this page with a TikTok error…
  failTimes: Infinity, // …this many times, then normally
  failCode: 50000, // 50000 = temporary system error (retried); 40002 = bad request (final)
  onReport: null as null | (() => Promise<void>), // runs before each report page is answered
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
      const inRange = tiktok.report.filter((r) => {
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
    expect(ok.status).toBe(200);
    expect(JSON.stringify(await ok.json())).not.toMatch(/acc-|ref-|Bearer/);
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
