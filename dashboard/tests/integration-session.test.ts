// AdMate integration: the Supabase -> dashboard session bridge, per-request
// authorisation, sign-out and the request gate (INTEGRATION.md). Runs on the
// embedded database with a fake Supabase Auth server; no network.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A minimal cookie jar standing in for next/headers in route handlers.
const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
// Request headers seen by the code under test.
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const ORIGIN = "https://www.admate.test";
const OWNER = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";
const TOKENS: Record<string, { id: string; email: string } | "expired"> = {
  "owner.jwt.sig": { id: OWNER, email: "Owner@Example.test" },
  "other.jwt.sig": { id: OTHER, email: "someone@example.test" },
  "expired.jwt.sig": "expired",
};
let authDown = false;
const authCalls: string[] = [];

beforeAll(() => {
  process.env.ADMATE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "admate-bridge-"));
  delete process.env.DATABASE_URL;
});

beforeEach(() => {
  process.env.ADMATE_PUBLIC_ORIGIN = ORIGIN;
  process.env.SUPABASE_URL = "https://auth.supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.META_OWNER_USER_ID = OWNER;
  authDown = false;
  authCalls.length = 0;
  jar.clear();
  requestHeaders = new Headers();
  delete process.env.ADMATE_ACCESS;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    authCalls.push(url);
    if (authDown) throw new Error("connect ECONNREFUSED");
    if (url !== "https://auth.supabase.test/auth/v1/user") return new Response("{}", { status: 404 });
    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    const user = TOKENS[token];
    if (!user || user === "expired") return new Response(JSON.stringify({ msg: "invalid JWT" }), { status: 401 });
    return new Response(JSON.stringify(user), { status: 200 });
  });
});
// Each test starts with no dashboard sessions (a fresh browser).
beforeEach(async () => {
  const { getDb } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  await (await getDb()).delete(schema.sessions);
});
afterEach(() => vi.unstubAllGlobals());

async function modules() {
  const route = await import("@/app/api/session/route");
  const session = await import("@/lib/auth/session");
  const { getDb } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  return { route, session, db: await getDb(), schema, eq };
}

function bridge(method: "POST" | "DELETE", opts: { token?: string; auth?: string; origin?: string | null; site?: string } = {}) {
  const headers = new Headers();
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  headers.set("sec-fetch-site", opts.site ?? "same-origin");
  if (opts.auth) headers.set("authorization", opts.auth);
  else if (opts.token) headers.set("authorization", `Bearer ${opts.token}`);
  return new Request(`${ORIGIN}/app/api/session`, { method, headers });
}

async function counts(userId: string) {
  const { db, schema, eq } = await modules();
  const u = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const w = await db.select().from(schema.workspaces).where(eq(schema.workspaces.ownerId, userId));
  const s = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
  return { users: u.length, workspaces: w.length, samples: w.filter((x) => x.isSample).length, sessions: s.length };
}

describe("session bridge", () => {
  it("owner: verified with Supabase, gets a session cookie, a user row and one sample account", async () => {
    const { route, session } = await modules();
    const res = await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    expect(res.status).toBe(200);
    // First entry: the website counts a completed sign-up from this (analytics).
    expect(await res.json()).toEqual({ ok: true, first: true });
    expect(authCalls).toEqual(["https://auth.supabase.test/auth/v1/user"]);
    const cookie = jar.get("admate_session");
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const expires = (cookie!.options!.expires as Date).getTime() - Date.now();
    expect(expires).toBeLessThanOrEqual(12 * 3600_000 + 5_000);
    expect(expires).toBeGreaterThan(11.9 * 3600_000);
    expect(await counts(OWNER)).toEqual({ users: 1, workspaces: 1, samples: 1, sessions: 1 });
    expect(await session.getCurrentUser()).toEqual({ id: OWNER, email: "owner@example.test" });
  });

  it("owner again: no second sample account, the old session is replaced", async () => {
    const { route } = await modules();
    const first = jar.get("admate_session")?.value;
    const again = await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true }); // not a new sign-up
    expect((await route.POST(bridge("POST", { token: "owner.jwt.sig" }))).status).toBe(200);
    expect(jar.get("admate_session")?.value).not.toBe(first);
    const c = await counts(OWNER);
    expect(c.samples).toBe(1);
    expect(c.users).toBe(1);
  });

  it("signed-in but not authorised: 403, no user row, no workspace, no cookie", async () => {
    const { route } = await modules();
    const res = await route.POST(bridge("POST", { token: "other.jwt.sig" }));
    expect(res.status).toBe(403);
    expect(jar.has("admate_session")).toBe(false);
    expect(await counts(OTHER)).toEqual({ users: 0, workspaces: 0, samples: 0, sessions: 0 });
  });

  it("switching users in one browser: a refused sign-in also ends the previous user's session", async () => {
    const { route, session } = await modules();
    expect((await route.POST(bridge("POST", { token: "owner.jwt.sig" }))).status).toBe(200);
    expect(await session.getCurrentUser()).not.toBeNull();
    expect((await route.POST(bridge("POST", { token: "other.jwt.sig" }))).status).toBe(403);
    expect(jar.has("admate_session")).toBe(false);
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("expired, malformed, non-bearer or unverifiable tokens: 401 and nothing is created", async () => {
    const { route } = await modules();
    const before = await counts(OWNER);
    for (const opts of [{ token: "expired.jwt.sig" }, { token: "not-a-jwt" }, { auth: "Basic owner.jwt.sig" }, {}]) {
      const res = await route.POST(bridge("POST", opts));
      expect(res.status).toBe(401);
    }
    authDown = true;
    expect((await route.POST(bridge("POST", { token: "owner.jwt.sig" }))).status).toBe(401);
    expect(jar.has("admate_session")).toBe(false);
    expect(await counts(OWNER)).toEqual(before);
  });

  it("only the website itself may call it (no cross-site sign-in or sign-out)", async () => {
    const { route } = await modules();
    for (const opts of [{ origin: "https://evil.test" }, { origin: null }, { site: "cross-site" }, { site: "same-site" }]) {
      const res = await route.POST(bridge("POST", { token: "owner.jwt.sig", ...opts }));
      expect(res.status).toBe(403);
    }
    expect(authCalls).toEqual([]);
    delete process.env.ADMATE_PUBLIC_ORIGIN;
    expect((await route.POST(bridge("POST", { token: "owner.jwt.sig" }))).status).toBe(503);
  });

  it("responses never contain the token", async () => {
    const { route } = await modules();
    for (const token of ["owner.jwt.sig", "other.jwt.sig", "expired.jwt.sig"]) {
      const text = await (await route.POST(bridge("POST", { token }))).text();
      expect(text).not.toContain(token);
    }
  });
});

describe("sign-out", () => {
  it("DELETE ends the session; a cross-site DELETE is refused and changes nothing", async () => {
    const { route, session } = await modules();
    await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    expect((await route.DELETE(bridge("DELETE", { origin: "https://evil.test" }))).status).toBe(403);
    expect(await session.getCurrentUser()).not.toBeNull();
    expect((await route.DELETE(bridge("DELETE"))).status).toBe(200);
    expect(jar.has("admate_session")).toBe(false);
    expect(await session.getCurrentUser()).toBeNull();
    expect((await counts(OWNER)).sessions).toBe(0);
  });

  it("the dashboard's Sign out ends the session and goes to the website's /logout", async () => {
    const { route, session } = await modules();
    await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    const { signOut } = await import("@/app/(auth)/actions");
    const err = await signOut().then(() => null, (e: unknown) => e as { digest?: string });
    expect(String(err?.digest)).toContain(`${ORIGIN}/logout`);
    expect(await session.getCurrentUser()).toBeNull();
  });
});

describe("per-request authorisation", () => {
  it("revoking access blocks the very next request, even with a valid cookie, and deletes that session", async () => {
    const { route, session } = await modules();
    await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    expect(jar.has("admate_session")).toBe(true);
    process.env.META_OWNER_USER_ID = OTHER; // the owner is no longer authorised
    expect(await session.getCurrentUser()).toBeNull();
    expect((await counts(OWNER)).sessions).toBe(0);
    const err = await session.requireUser().then(() => null, (e: unknown) => e as { digest?: string });
    expect(String(err?.digest)).toContain(`${ORIGIN}/home`);
  });

  it("with no owner configured nobody is authorised (fails closed)", async () => {
    const { route, session } = await modules();
    await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    delete process.env.META_OWNER_USER_ID;
    expect(await session.getCurrentUser()).toBeNull();
    expect((await route.POST(bridge("POST", { token: "owner.jwt.sig" }))).status).toBe(403);
  });

  it("an expired dashboard session is signed out", async () => {
    const { route, session, db, schema, eq } = await modules();
    await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.userId, OWNER));
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("only an owner or (later) an `active` entitlement grants access", async () => {
    const policy = await import("@/lib/access/policy");
    expect(policy.GRANTING_ENTITLEMENT).toBe("active");
    expect(await policy.resolveAccess(OWNER)).toEqual({ kind: "owner" });
    expect(await policy.resolveAccess(OTHER)).toEqual({ kind: "denied" });
    expect(await policy.isAuthorized(OTHER)).toBe(false);
  });
});

describe("request gate (proxy.ts)", () => {
  const req = (p: string, cookie?: string) => {
    const r = new NextRequest(`https://dashboard.vercel.test/app${p}`, { nextConfig: { basePath: "/app" } });
    if (cookie) r.cookies.set("admate_session", cookie);
    return r;
  };

  it("signed-out pages go to the website's /home with a return path; the API answers 401", async () => {
    const { proxy } = await import("@/proxy");
    const page = proxy(req("/accounts/new?x=1"));
    expect(page.status).toBe(307);
    const location = new URL(page.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/home");
    expect(location.searchParams.get("next")).toBe("/app/accounts/new?x=1");
    const root = new URL(proxy(req("/")).headers.get("location")!);
    expect(root.pathname).toBe("/home");
    expect(root.searchParams.has("next")).toBe(false);
    expect(proxy(req("/api/summary?ws=x")).status).toBe(401);
  });

  it("the bridge is reachable signed out; the old password pages are not", async () => {
    const { proxy } = await import("@/proxy");
    expect(proxy(req("/api/session")).headers.get("x-middleware-next")).toBe("1");
    for (const p of ["/login", "/signup"]) expect(proxy(req(p)).status).toBe(307);
    expect(proxy(req("/c/abc", "cookie")).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("Server Actions behind the website's /app rewrite (next.config.ts)", () => {
  async function allowedOrigins(publicOrigin: string | undefined) {
    if (publicOrigin === undefined) delete process.env.ADMATE_PUBLIC_ORIGIN;
    else process.env.ADMATE_PUBLIC_ORIGIN = publicOrigin;
    vi.resetModules();
    const config = (await import("@/next.config")).default;
    return config.experimental?.serverActions?.allowedOrigins;
  }

  it("allows exactly the public host, with its port, and nothing else", async () => {
    expect(await allowedOrigins("https://www.admate.site")).toEqual(["www.admate.site"]);
    expect(await allowedOrigins("https://www.admate.site/")).toEqual(["www.admate.site"]);
    expect(await allowedOrigins("http://localhost:3000")).toEqual(["localhost:3000"]);
    expect(await allowedOrigins("https://admate-git-x.vercel.app")).toEqual(["admate-git-x.vercel.app"]);
  });

  it("adds nothing (Next.js same-origin default) when the public origin is unset or invalid", async () => {
    expect(await allowedOrigins(undefined)).toEqual([]);
    expect(await allowedOrigins("not a url")).toEqual([]);
    expect(await allowedOrigins("ftp://www.admate.site")).toEqual([]);
  });

  it("never contains a wildcard", async () => {
    for (const o of ["https://www.admate.site", "http://localhost:3000"]) {
      for (const entry of (await allowedOrigins(o)) ?? []) expect(entry).not.toContain("*");
    }
  });
});

describe("open registration (ADMATE_ACCESS=open)", () => {
  it("any Supabase-verified user gets in; without the setting only the owner (fails closed)", async () => {
    const policy = await import("@/lib/access/policy");
    expect(await policy.isAuthorized(OTHER)).toBe(false);
    process.env.ADMATE_ACCESS = "open";
    expect(await policy.resolveAccess(OTHER)).toEqual({ kind: "user" });
    expect(await policy.resolveAccess(OWNER)).toEqual({ kind: "owner" });
    process.env.ADMATE_ACCESS = "openish";
    expect(await policy.isAuthorized(OTHER)).toBe(false);
  });

  it("system users (public demo owners) are never authorised, whatever the mode", async () => {
    const policy = await import("@/lib/access/policy");
    process.env.ADMATE_ACCESS = "open";
    for (const id of ["public-demo-a", "public-demo-b", "public-demo-refresh-lease", ""]) expect(await policy.isAuthorized(id)).toBe(false);
  });

  it("a customer gets a session but no sample, even across concurrent sign-ins", async () => {
    process.env.ADMATE_ACCESS = "open";
    const { route, session } = await modules();
    const res = await route.POST(bridge("POST", { token: "other.jwt.sig" }));
    expect(res.status).toBe(200);
    expect(await session.getCurrentUser()).toEqual({ id: OTHER, email: "someone@example.test" });
    expect(await counts(OTHER)).toMatchObject({ users: 1, workspaces: 0, samples: 0, sessions: 1 });
    jar.clear();
    const [a, b] = await Promise.all([route.POST(bridge("POST", { token: "other.jwt.sig" })), route.POST(bridge("POST", { token: "other.jwt.sig" }))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await counts(OTHER)).samples).toBe(0);
  });
});

describe("owner-only sample", () => {
  it("rejects old demo URLs and API reads without a valid session", async () => {
    const { proxy } = await import("@/proxy");
    const { session } = await modules();
    requestHeaders = new Headers({ "x-admate-public-demo": "1" });
    // An incoming marker is untrusted until proxy.ts has replaced it.
    requestHeaders = new Headers();
    expect(await session.getCurrentUser()).toBeNull();
    const read = (p: string) => proxy(new NextRequest(`${ORIGIN}/app${p}`, {
      nextConfig: { basePath: "/app" }, headers: requestHeaders,
    }));
    for (const p of ["/c/old-demo", "/c/old-demo/settings"]) {
      expect(read(p).status).toBe(307);
      expect(new URL(read(p).headers.get("location")!).pathname).toBe("/home");
    }
    for (const p of ["/api/counts", "/api/v5/daily", "/api/v5/detail", "/api/internal/public-demo"]) {
      expect(read(p).status).toBe(401);
    }
    const demo = await import("@/app/demo/route");
    expect((await demo.GET()).headers.get("location")).toBe("/app/c/00000000-0000-4000-8000-00000000de00");
  });

  it("customers cannot list, open or recreate sample workspaces; the verified owner can", async () => {
    process.env.ADMATE_ACCESS = "open";
    const { route, db, schema } = await modules();
    const { getWorkspace, listWorkspaces } = await import("@/lib/data/workspaces");
    const { createSampleAccount } = await import("@/lib/sample/load");
    const { loadSampleData } = await import("@/app/actions");
    const demo = await import("@/app/demo/route");
    const [ownerSample] = await db.select().from(schema.workspaces).where(
      (await import("drizzle-orm")).eq(schema.workspaces.ownerId, OWNER),
    );
    expect(ownerSample.isSample).toBe(true);
    await route.POST(bridge("POST", { token: "other.jwt.sig" }));
    const legacyId = "12345678-1234-4123-8123-123456789123";
    const customerId = "12345678-1234-4123-8123-123456789124";
    await db.insert(schema.workspaces).values([
      { id: legacyId, ownerId: OTHER, name: "Previous sample", currency: "USD", isSample: true },
      { id: customerId, ownerId: OTHER, name: "Customer account", currency: "USD" },
    ]);
    expect((await listWorkspaces()).map((w) => w.id)).toEqual([customerId]);
    expect(await getWorkspace(legacyId)).toBeNull();
    expect(await getWorkspace(ownerSample.id)).toBeNull();
    expect((await demo.GET()).status).toBe(307);
    await expect(createSampleAccount(OTHER)).rejects.toThrow("Sample account unavailable.");
    const redirect = await loadSampleData().then(() => null, (error: { digest?: string }) => error.digest);
    expect(redirect).toContain("NEXT_REDIRECT");
    expect((await counts(OTHER)).samples).toBe(1); // No reset or new sample.

    await route.POST(bridge("POST", { token: "owner.jwt.sig" }));
    expect((await listWorkspaces()).map((w) => w.id)).toEqual([ownerSample.id]);
    expect(await getWorkspace(customerId)).toBeNull();
    expect((await demo.GET()).headers.get("location")).toBe("/app/c/00000000-0000-4000-8000-00000000de00");
  });
});

describe("upload file checks (lib/integration/limits.ts)", () => {
  it("accepts real CSV / XLSX content and refuses everything else", async () => {
    const { checkUploadFile } = await import("@/lib/integration/limits");
    const csv = new TextEncoder().encode("Campaign name,Day,Amount spent\nA,2026-09-01,10\n");
    expect(checkUploadFile("meta.csv", csv)).toBeNull();
    expect(checkUploadFile("meta.exe", csv)).toMatch(/csv/);
    expect(checkUploadFile("meta.csv", new Uint8Array(0))).toMatch(/empty/);
    expect(checkUploadFile("meta.csv", new Uint8Array([0x4d, 0x5a, 0, 0, 1]))).toMatch(/doesn't look like/);
    expect(checkUploadFile("meta.xlsx", csv)).toMatch(/valid .xlsx/);
    expect(checkUploadFile("big.csv", new Uint8Array(4 * 1024 * 1024 + 1).fill(65))).toMatch(/larger than 4 MB/);
  });

  it("refuses a zip bomb disguised as .xlsx without unpacking it", async () => {
    const { checkUploadFile } = await import("@/lib/integration/limits");
    // A minimal zip whose central directory claims one 100 MB entry.
    const name = new TextEncoder().encode("x.xml");
    const local = new Uint8Array(30 + name.length);
    new DataView(local.buffer).setUint32(0, 0x04034b50, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const v = new DataView(cd.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint32(24, 100 * 1024 * 1024, true);
    v.setUint16(28, name.length, true);
    cd.set(name, 46);
    const eocd = new Uint8Array(22);
    const e = new DataView(eocd.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, 1, true);
    e.setUint16(10, 1, true);
    e.setUint32(12, cd.length, true);
    e.setUint32(16, local.length, true);
    const zip = new Uint8Array([...local, ...cd, ...eocd]);
    expect(checkUploadFile("report.xlsx", zip)).toMatch(/too large once unpacked/);
    v.setUint32(24, 1000, true);
    const small = new Uint8Array([...local, ...cd, ...eocd]);
    expect(checkUploadFile("report.xlsx", small)).toBeNull();
  });
});
