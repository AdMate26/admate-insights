// AdMate integration: server-side analytics for signed-in people
// (lib/analytics-server.ts, app/api/activity). Embedded database, fake Supabase
// Auth and a fake PostHog; no network.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The first test in this file sets up the embedded database and a sample account.
vi.setConfig({ testTimeout: 20_000 });

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));
// after() needs a live request outside tests; run the work and keep its promise.
const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => unknown) => void pending.push(Promise.resolve().then(task)),
}));

const ORIGIN = "https://www.admate.site";
const USER = "11111111-2222-4333-8444-555555555555";
const posthog: { url: string; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  process.env.ADMATE_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "admate-activity-"));
  delete process.env.DATABASE_URL;
  // Create and migrate the embedded database once, before the timed tests.
  await (await import("@/lib/db/client")).getDb();
}, 60_000);

beforeEach(() => {
  process.env.ADMATE_PUBLIC_ORIGIN = ORIGIN;
  process.env.ADMATE_ACCESS = "open";
  process.env.SUPABASE_URL = "https://auth.supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_testtesttesttesttesttest1234";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  jar.clear();
  requestHeaders = new Headers();
  posthog.length = 0;
  pending.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === "https://auth.supabase.test/auth/v1/user")
      return new Response(JSON.stringify({ id: USER, email: "Person@Example.test", app_metadata: { provider: "google" } }), { status: 200 });
    if (url.startsWith("https://us.i.posthog.com/")) {
      posthog.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const settle = async () => {
  await Promise.all(pending);
  pending.length = 0;
};

function post(route: string, body: unknown, origin: string | null = ORIGIN) {
  const headers = new Headers({ "content-type": "application/json", "sec-fetch-site": "same-origin" });
  if (origin) headers.set("origin", origin);
  if (route.endsWith("/session")) headers.set("authorization", "Bearer user.jwt.sig");
  return new Request(`${ORIGIN}/app${route}`, { method: "POST", headers, body: body === null ? undefined : JSON.stringify(body) });
}

async function signIn() {
  const { POST } = await import("@/app/api/session/route");
  expect((await POST(post("/api/session", null))).status).toBe(200);
  await settle();
  posthog.length = 0;
}

describe("server-side analytics", () => {
  it("uuidv7 ids are valid and time-ordered", async () => {
    const { uuidv7 } = await import("@/lib/analytics-server");
    const a = uuidv7(new Date("2026-10-28T00:00:00Z"));
    const b = uuidv7(new Date("2026-10-28T00:00:01Z"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });

  it("a sign-up is recorded by the server with the user ID, email and method", async () => {
    const { POST } = await import("@/app/api/session/route");
    expect((await POST(post("/api/session", null))).status).toBe(200);
    await settle();
    const signup = posthog.find((p) => p.body.event === "signup_completed");
    expect(signup?.body).toMatchObject({ distinct_id: USER, properties: { method: "google", app: "dashboard", app_env: "production", $set: { email: "person@example.test" } } });
    expect(String(signup?.body.api_key)).toMatch(/^phc_/);
  });

  it("signed-in page views go to PostHog in one visit, with a cleaned path; Overview counts as analysis viewed", async () => {
    const { getDb } = await import("@/lib/db/client");
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [ws] = await (await getDb()).select().from(schema.workspaces).where(eq(schema.workspaces.ownerId, USER));
    const { POST } = await import("@/app/api/activity/route");
    await signIn();

    expect((await POST(post("/api/activity", { kind: "view", path: `/c/${ws!.id}` }))).status).toBe(204);
    expect((await POST(post("/api/activity", { kind: "leave", path: `/c/${ws!.id}`, seconds: 42.25 }))).status).toBe(204);
    expect((await POST(post("/api/activity", { kind: "view", path: `/c/${ws!.id}/actions` }))).status).toBe(204);
    await settle();

    const events = posthog.map((p) => p.body);
    expect(events.map((e) => e.event)).toEqual(["$pageview", "analysis_viewed", "$pageleave", "$pageview"]);
    const sessions = new Set(events.map((e) => (e.properties as Record<string, unknown>).$session_id));
    expect(sessions.size).toBe(1);
    const first = events[0]!.properties as Record<string, unknown>;
    expect(first.$pathname).toBe("/app/c/:id");
    expect(first.$current_url).toBe("https://www.admate.site/app/c/:id");
    expect(events[1]!.properties).toMatchObject({ account: "sample" });
    expect(events[2]!.properties).toMatchObject({ $prev_pageview_duration: 42.3 });
    expect(JSON.stringify(events)).not.toContain(ws!.id);
  });

  it("a new visit starts after 30 minutes without activity", async () => {
    const { touchVisit, VISIT_GAP_MS } = await import("@/lib/analytics-server");
    const t0 = new Date("2026-10-28T08:00:00Z");
    const a = await touchVisit(USER, t0);
    const b = await touchVisit(USER, new Date(t0.getTime() + VISIT_GAP_MS - 1000));
    const c = await touchVisit(USER, new Date(t0.getTime() + 2 * VISIT_GAP_MS + 5000));
    expect(b.visitId).toBe(a.visitId);
    expect(b.isNew).toBe(false);
    expect(c.visitId).not.toBe(a.visitId);
    expect(c.isNew).toBe(true);
  });

  it("not signed in, other sites and bad input: nothing is sent", async () => {
    const { POST } = await import("@/app/api/activity/route");
    expect((await POST(post("/api/activity", { kind: "view", path: "/c/x" }))).status).toBe(204); // not signed in
    await signIn();
    expect((await POST(post("/api/activity", { kind: "view", path: "/c/x" }, "https://evil.example"))).status).toBe(403);
    expect((await POST(post("/api/activity", { kind: "click", path: "/c/x" }))).status).toBe(400);
    expect((await POST(post("/api/activity", { kind: "view", path: "https://evil.example/x?token=1" }))).status).toBe(400);
    await settle();
    expect(posthog).toHaveLength(0);
  });

  it("without a PostHog key nothing is recorded", async () => {
    const { POST } = await import("@/app/api/activity/route");
    await signIn();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    expect((await POST(post("/api/activity", { kind: "view", path: "/" }))).status).toBe(204);
    await settle();
    expect(posthog).toHaveLength(0);
  });
});
