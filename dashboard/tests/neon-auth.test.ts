// Neon Auth on TikTok staging (ADMATE_AUTH_PROVIDER=neon, lib/auth/neon.ts):
// token verification, the session bridge, two-user isolation, sign-out, expiry
// and the /api/auth relay's allowlist. Neon's signing key is replaced by a
// local test key; no network.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

// Neon's published keys (JWKS) -> our local test key. Records which URL was asked for.
let neonKeys: JWTVerifyGetKey;
const jwksUrls: string[] = [];
vi.mock("jose", async (importOriginal) => {
  const real = await importOriginal<typeof import("jose")>();
  return {
    ...real,
    createRemoteJWKSet: (url: URL) => {
      jwksUrls.push(url.href);
      return ((...args: Parameters<JWTVerifyGetKey>) => neonKeys(...args)) as JWTVerifyGetKey;
    },
  };
});

// Neon's SDK relay -> a recorder (the real one forwards to Neon Auth).
const relayed: { method: string; path: string }[] = [];
const sdkConfigs: unknown[] = [];
vi.mock("@neon/auth/next/server", () => ({
  createNeonAuth: (config: unknown) => {
    sdkConfigs.push(config);
    const answer = (method: string) => async (_request: Request, context: { params: Promise<{ path: string[] }> }) => {
      relayed.push({ method, path: (await context.params).path.join("/") });
      return Response.json({ relayed: true });
    };
    return { handler: () => ({ GET: answer("GET"), POST: answer("POST") }) };
  },
}));

const ORIGIN = "https://admate-tiktok-staging.vercel.app";
const NEON_BASE = "https://ep-test-auth-123456.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth";
const ISSUER = new URL(NEON_BASE).origin;
const ALICE = "aaaaaaaa-1111-4222-8333-444444444444";
const BOB = "bbbbbbbb-5555-4666-8777-888888888888";

let privateKey: CryptoKey;
let attackerKey: CryptoKey;

beforeAll(async () => {
  process.env.ADMATE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "admate-neon-"));
  delete process.env.DATABASE_URL;
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), alg: "EdDSA", kid: "neon-test" };
  neonKeys = createLocalJWKSet({ keys: [jwk] });
  attackerKey = (await generateKeyPair("EdDSA", { crv: "Ed25519" })).privateKey;
});

beforeEach(async () => {
  process.env.ADMATE_AUTH_PROVIDER = "neon";
  process.env.NEON_AUTH_BASE_URL = NEON_BASE;
  process.env.NEON_AUTH_COOKIE_SECRET = "a-test-cookie-secret-of-at-least-32-chars";
  process.env.ADMATE_PUBLIC_ORIGIN = ORIGIN;
  process.env.ADMATE_ACCESS = "open";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  jar.clear();
  relayed.length = 0;
  // Any network call (e.g. to Supabase) would be a bug here.
  vi.stubGlobal("fetch", async (url: string) => {
    throw new Error(`unexpected network call to ${url}`);
  });
  const { getDb } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  await (await getDb()).delete(schema.sessions);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type Claims = Record<string, unknown>;
async function token(claims: Claims = {}, opts: { key?: CryptoKey; issuer?: string; audience?: string; expires?: string | number } = {}) {
  return new SignJWT({ email: "Alice@Example.test", emailVerified: true, banned: false, role: "user", ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid: "neon-test" })
    .setSubject(typeof claims.sub === "string" ? claims.sub : ALICE)
    .setIssuedAt()
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? ISSUER)
    .setExpirationTime(opts.expires ?? "15m")
    .sign(opts.key ?? privateKey);
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("Neon token verification", () => {
  it("accepts Neon's token for a verified user, checked against Neon's published key", async () => {
    const { verifyNeonToken } = await import("@/lib/auth/neon");
    expect(await verifyNeonToken(`Bearer ${await token()}`)).toEqual({ id: ALICE, email: "alice@example.test", emailConfirmed: true, provider: "email" });
    expect(jwksUrls.at(-1)).toBe(`${NEON_BASE}/.well-known/jwks.json`);
  });

  it("reports an unverified email (the bridge refuses it)", async () => {
    const { verifyNeonToken } = await import("@/lib/auth/neon");
    expect((await verifyNeonToken(`Bearer ${await token({ emailVerified: false })}`))?.emailConfirmed).toBe(false);
    expect((await verifyNeonToken(`Bearer ${await token({ emailVerified: undefined })}`))?.emailConfirmed).toBe(false);
  });

  it("rejects forged, altered, expired, misaddressed or incomplete tokens", async () => {
    const { verifyNeonToken } = await import("@/lib/auth/neon");
    const good = await token();
    const [header, , signature] = good.split(".");
    const forged = {
      "another user's ID in a real token": `${header}.${b64({ sub: BOB, email: "bob@example.test", emailVerified: true, iss: ISSUER, aud: ISSUER, iat: 1, exp: 4102444800 })}.${signature}`,
      "changed signature": `${good.slice(0, -4)}AAAA`,
      "unsigned (alg none)": `${b64({ alg: "none" })}.${good.split(".")[1]}.`,
      "attacker's own key": await token({}, { key: attackerKey }),
      "HMAC signed": await new SignJWT({ email: "a@example.test", emailVerified: true }).setProtectedHeader({ alg: "HS256" }).setSubject(ALICE).setIssuer(ISSUER).setAudience(ISSUER).setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode("x".repeat(32))),
      "wrong issuer": await token({}, { issuer: "https://evil.neonauth.example" }),
      "wrong audience": await token({}, { audience: "https://other.example" }),
      expired: await token({}, { expires: Math.floor(Date.now() / 1000) - 60 }),
      "not a UUID user": await token({ sub: "admin" }),
      "no email": await token({ email: undefined }),
      banned: await token({ banned: true }),
    };
    for (const [label, jwt] of Object.entries(forged)) {
      expect(await verifyNeonToken(`Bearer ${jwt}`), label).toBeNull();
    }
    for (const header of [null, "", "Bearer", `Basic ${good}`, good, "Bearer a.b"]) {
      expect(await verifyNeonToken(header)).toBeNull();
    }
  });

  it("without complete Neon configuration nothing is trusted", async () => {
    const { verifyNeonToken } = await import("@/lib/auth/neon");
    const jwt = await token();
    for (const [key, value] of [["NEON_AUTH_BASE_URL", undefined], ["NEON_AUTH_BASE_URL", "http://insecure.example/auth"], ["NEON_AUTH_COOKIE_SECRET", "too-short"]] as const) {
      const saved = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      expect(await verifyNeonToken(`Bearer ${jwt}`)).toBeNull();
      process.env[key] = saved;
    }
  });
});

function bridge(method: "POST" | "DELETE", jwt?: string, origin = ORIGIN) {
  const headers = new Headers({ origin, "sec-fetch-site": "same-origin" });
  if (jwt) headers.set("authorization", `Bearer ${jwt}`);
  return new Request(`${ORIGIN}/app/api/session`, { method, headers });
}

describe("session bridge with Neon Auth", () => {
  it("a verified Neon user gets a 12-hour dashboard session, a user row with Neon's ID and their own sample", async () => {
    const route = await import("@/app/api/session/route");
    const session = await import("@/lib/auth/session");
    const res = await route.POST(bridge("POST", await token()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, first: true });
    const cookie = jar.get("admate_session");
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect((cookie!.options!.expires as Date).getTime() - Date.now()).toBeLessThanOrEqual(12 * 3600_000 + 5_000);
    expect(await session.getCurrentUser()).toEqual({ id: ALICE, email: "alice@example.test" });
  });

  it("an unverified email is refused, even with open registration: 403, no session", async () => {
    const route = await import("@/app/api/session/route");
    const res = await route.POST(bridge("POST", await token({ sub: BOB, email: "bob@example.test", emailVerified: false })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "email_unverified" });
    expect(jar.has("admate_session")).toBe(false);
  });

  it("a forged token is refused and ends any earlier session in this browser", async () => {
    const route = await import("@/app/api/session/route");
    expect((await route.POST(bridge("POST", await token()))).status).toBe(200);
    expect((await route.POST(bridge("POST", await token({}, { key: attackerKey })))).status).toBe(401);
    expect(jar.has("admate_session")).toBe(false);
  });

  it("a Supabase token isn't accepted when staging uses Neon", async () => {
    const route = await import("@/app/api/session/route");
    const supabaseLike = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ALICE, email: "alice@example.test" })}.c2ln`;
    expect((await route.POST(bridge("POST", supabaseLike))).status).toBe(401);
  });

  it("two users: each sees only their own accounts", async () => {
    const route = await import("@/app/api/session/route");
    const { getWorkspace, listWorkspaces } = await import("@/lib/data/workspaces");
    expect((await route.POST(bridge("POST", await token()))).status).toBe(200);
    const alice = (await listWorkspaces()).map((w) => w.id);
    expect((await route.POST(bridge("POST", await token({ sub: BOB, email: "bob@example.test" })))).status).toBe(200);
    const bob = (await listWorkspaces()).map((w) => w.id);
    expect(alice.length).toBeGreaterThan(0);
    expect(bob.length).toBeGreaterThan(0);
    expect(bob.some((id) => alice.includes(id))).toBe(false);
    for (const id of alice) expect(await getWorkspace(id)).toBeNull(); // Bob is signed in
    expect((await route.POST(bridge("POST", await token()))).status).toBe(200);
    for (const id of bob) expect(await getWorkspace(id)).toBeNull(); // Alice again
    for (const id of alice) expect(await getWorkspace(id)).not.toBeNull();
  });

  it("sign-out ends the dashboard session; a cross-site sign-out is refused", async () => {
    const route = await import("@/app/api/session/route");
    const session = await import("@/lib/auth/session");
    await route.POST(bridge("POST", await token()));
    expect((await route.DELETE(bridge("DELETE", undefined, "https://evil.test"))).status).toBe(403);
    expect(await session.getCurrentUser()).not.toBeNull();
    expect((await route.DELETE(bridge("DELETE"))).status).toBe(200);
    expect(jar.has("admate_session")).toBe(false);
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("the dashboard session expires after 12 hours", async () => {
    const route = await import("@/app/api/session/route");
    const session = await import("@/lib/auth/session");
    await route.POST(bridge("POST", await token()));
    expect(await session.getCurrentUser()).not.toBeNull();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 12 * 3600_000 + 60_000);
    expect(await session.getCurrentUser()).toBeNull();
  });
});

function relay(method: "GET" | "POST", route: string, opts: { origin?: string | null; body?: unknown } = {}) {
  const headers = new Headers();
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(`${ORIGIN}/app/api/auth/${route}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return [request, { params: Promise.resolve({ path: route.split("/") }) }] as const;
}

describe("/api/auth relay", () => {
  it("relays only the email-code sign-in, session, token and sign-out requests", async () => {
    const { GET, POST } = await import("@/app/api/auth/[...path]/route");
    expect((await POST(...relay("POST", "email-otp/send-verification-otp", { body: { email: "a@example.test", type: "sign-in" } }))).status).toBe(200);
    expect((await POST(...relay("POST", "sign-in/email-otp", { body: { email: "a@example.test", otp: "123456" } }))).status).toBe(200);
    expect((await GET(...relay("GET", "get-session"))).status).toBe(200);
    expect((await GET(...relay("GET", "token"))).status).toBe(200);
    expect((await POST(...relay("POST", "sign-out", { body: {} }))).status).toBe(200);
    expect(relayed.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST email-otp/send-verification-otp",
      "POST sign-in/email-otp",
      "GET get-session",
      "GET token",
      "POST sign-out",
    ]);
    expect(sdkConfigs.at(-1)).toMatchObject({ baseUrl: NEON_BASE, cookies: { sameSite: "lax" } });
  });

  it("everything else Neon Auth offers is 404 (password sign-up, account changes, admin)", async () => {
    const { GET, POST } = await import("@/app/api/auth/[...path]/route");
    for (const route of ["sign-up/email", "sign-in/email", "sign-in/social", "change-email", "delete-user", "update-user", "admin/list-users", "email-otp/verify-email", "forget-password/email-otp", "list-sessions"]) {
      expect((await POST(...relay("POST", route, { body: {} }))).status, route).toBe(404);
      expect((await GET(...relay("GET", route))).status, route).toBe(404);
    }
    expect((await POST(...relay("POST", "get-session", { body: {} }))).status).toBe(404);
    expect((await GET(...relay("GET", "sign-out"))).status).toBe(404);
    expect(relayed).toEqual([]);
  });

  it("codes are only sent for signing in, and only for the website itself", async () => {
    const { POST } = await import("@/app/api/auth/[...path]/route");
    for (const type of ["forget-password", "email-verification", undefined]) {
      expect((await POST(...relay("POST", "email-otp/send-verification-otp", { body: { email: "a@example.test", type } }))).status).toBe(400);
    }
    for (const origin of ["https://evil.test", null]) {
      expect((await POST(...relay("POST", "sign-in/email-otp", { origin, body: { email: "a@example.test", otp: "1" } }))).status).toBe(403);
    }
    expect(relayed).toEqual([]);
  });

  it("is 404 on Supabase deployments (production) and without Neon configuration", async () => {
    const { GET } = await import("@/app/api/auth/[...path]/route");
    process.env.ADMATE_AUTH_PROVIDER = "supabase";
    expect((await GET(...relay("GET", "get-session"))).status).toBe(404);
    delete process.env.ADMATE_AUTH_PROVIDER;
    expect((await GET(...relay("GET", "get-session"))).status).toBe(404);
    process.env.ADMATE_AUTH_PROVIDER = "neon";
    delete process.env.NEON_AUTH_BASE_URL;
    expect((await GET(...relay("GET", "get-session"))).status).toBe(404);
    expect(relayed).toEqual([]);
  });

  it("is reachable signed out (the request gate lets it through)", async () => {
    const { proxy } = await import("@/proxy");
    const res = proxy(new NextRequest(`${ORIGIN}/api/auth/get-session`));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
