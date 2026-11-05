import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_DEMO_HEADER, PUBLIC_DEMO_OWNER, PUBLIC_DEMO_WORKSPACE } from "@/lib/integration/public-demo";

vi.mock("server-only", () => ({}));
let requestHeaders = new Headers();
const cookieRead = vi.fn(() => { throw new Error("Demo must not read session cookies"); });
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: cookieRead,
}));

beforeEach(() => {
  requestHeaders = new Headers();
  cookieRead.mockClear();
});

function request(path: string, opts: { method?: string; action?: boolean; cookie?: boolean } = {}) {
  const headers = new Headers({ [PUBLIC_DEMO_HEADER]: "1" });
  if (opts.cookie) headers.set("cookie", "admate_session=pretend-owner");
  if (opts.action) headers.set("next-action", "pretend-action");
  return new NextRequest(`https://admate.test/app${path}`, {
    method: opts.method ?? "GET", headers, nextConfig: { basePath: "/app" },
  });
}

describe("current dashboard public demo", () => {
  it("accepts only the reserved sample and its read APIs, strips the real cookie", async () => {
    const { proxy } = await import("@/proxy");
    for (const path of ["/demo", `/c/${PUBLIC_DEMO_WORKSPACE}`, `/c/${PUBLIC_DEMO_WORKSPACE}/campaigns`, `/api/counts?ws=${PUBLIC_DEMO_WORKSPACE}`, `/api/v5/detail?ws=${PUBLIC_DEMO_WORKSPACE}`]) {
      const result = proxy(request(path, { cookie: true }));
      expect(result.headers.get("x-middleware-request-" + PUBLIC_DEMO_HEADER)).toBe("1");
      expect(result.headers.get("x-middleware-request-cookie")).toBeNull();
    }
    for (const path of ["/c/private", "/api/counts?ws=private", "/api/credits", "/api/internal/public-demo"]) {
      const result = proxy(request(path));
      expect(result.status).toBe(path.startsWith("/api/") ? 401 : 307);
      expect(result.headers.get("x-middleware-request-" + PUBLIC_DEMO_HEADER)).toBeNull();
    }
    const privateWithCookie = proxy(request("/c/private", { cookie: true }));
    expect(privateWithCookie.headers.get("x-middleware-next")).toBe("1");
    expect(privateWithCookie.headers.get("x-middleware-request-" + PUBLIC_DEMO_HEADER)).toBeNull();
  });

  it("blocks mutations even with an owner's cookie and removes forged scope from private actions", async () => {
    const { proxy } = await import("@/proxy");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(proxy(request(`/c/${PUBLIC_DEMO_WORKSPACE}/settings`, { method, cookie: true })).status).toBe(405);
    }
    expect(proxy(request(`/c/${PUBLIC_DEMO_WORKSPACE}`, { action: true, cookie: true })).status).toBe(405);
    const privateAction = proxy(request("/c/private", { method: "POST", action: true, cookie: true }));
    expect(privateAction.headers.get("x-middleware-request-" + PUBLIC_DEMO_HEADER)).toBeNull();
  });

  it("ignores user cookies and connection URLs and returns only the original Lotus sample", async () => {
    requestHeaders.set(PUBLIC_DEMO_HEADER, "1");
    // A real hosted URL must never be selected in the public scope.
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@invalid.example/never-connect");
    try {
      const { getCurrentUser } = await import("@/lib/auth/session");
      expect(await getCurrentUser()).toEqual({ id: PUBLIC_DEMO_OWNER, email: "", readOnly: true });
      expect(cookieRead).not.toHaveBeenCalled();
      const { getDb } = await import("@/lib/db/client");
      const { getWorkspace, listWorkspaces, loadAnalysis } = await import("@/lib/data/workspaces");
      const [db1, db2] = await Promise.all([getDb(), getDb()]);
      expect(db1).toBe(db2);
      const accounts = await listWorkspaces();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({ id: PUBLIC_DEMO_WORKSPACE, name: "Lotus Skincare (sample)", isSample: true, ownerId: PUBLIC_DEMO_OWNER });
      expect(await getWorkspace("11111111-2222-4333-8444-555555555555")).toBeNull();
      const analysis = await loadAnalysis(PUBLIC_DEMO_WORKSPACE);
      expect(analysis?.campaigns.length).toBeGreaterThan(0);
      const originalImports = await db1.select().from((await import("@/lib/db/schema")).imports);
      // Simulate a separate Vercel function's cold start. Entity/report links
      // from the first process must still address the same synthetic records.
      delete (globalThis as { __admatePublicDemoDb?: unknown }).__admatePublicDemoDb;
      const freshDb = await getDb();
      const freshAnalysis = await loadAnalysis(PUBLIC_DEMO_WORKSPACE);
      const freshImports = await freshDb.select().from((await import("@/lib/db/schema")).imports);
      expect(freshDb).not.toBe(db1);
      expect(freshAnalysis?.campaigns.map(c => c.info.id)).toEqual(analysis?.campaigns.map(c => c.info.id));
      expect(freshImports.map(i => i.id)).toEqual(originalImports.map(i => i.id));
      expect(cookieRead).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30000);
});
