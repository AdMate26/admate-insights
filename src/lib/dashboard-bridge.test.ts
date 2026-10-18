import { expect, test } from "bun:test";

import {
  endDashboardSession,
  enterDashboard,
  safeDashboardPath,
  signOutEverywhere,
} from "./dashboard-bridge";
import { dashboardRouteRules } from "./dashboard-route-rules";

/* ------------------------------ hand-off -------------------------------- */

function server(status: number | "down") {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (status === "down") throw new Error("offline");
    return new Response("{}", { status });
  };
  return { calls, fetchImpl };
}

test("hand-off: the token travels only in the Authorization header of a same-origin POST", async () => {
  const s = server(200);
  const outcome = await enterDashboard({ accessToken: "a.b.c", fetchImpl: s.fetchImpl });
  expect(outcome).toEqual({ kind: "dashboard", href: "/app" });
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0]!.url).toBe("/app/api/session");
  expect(s.calls[0]!.init?.method).toBe("POST");
  expect(s.calls[0]!.init?.credentials).toBe("same-origin");
  expect(new Headers(s.calls[0]!.init?.headers).get("authorization")).toBe("Bearer a.b.c");
  expect(s.calls[0]!.init?.body).toBeUndefined();
  expect(s.calls[0]!.url).not.toContain("a.b.c");
});

test("hand-off: each answer maps to one destination", async () => {
  expect(await enterDashboard({ accessToken: "a.b.c", fetchImpl: server(401).fetchImpl })).toEqual({
    kind: "login",
  });
  expect(await enterDashboard({ accessToken: "a.b.c", fetchImpl: server(403).fetchImpl })).toEqual({
    kind: "not_authorized",
  });
  for (const status of [500, 503, 404] as const) {
    expect(
      await enterDashboard({ accessToken: "a.b.c", fetchImpl: server(status).fetchImpl }),
    ).toEqual({
      kind: "error",
    });
  }
  expect(
    await enterDashboard({ accessToken: "a.b.c", fetchImpl: server("down").fetchImpl }),
  ).toEqual({
    kind: "error",
  });
});

test("hand-off: no Supabase session means /login, without calling the dashboard", async () => {
  const s = server(200);
  expect(await enterDashboard({ accessToken: null, fetchImpl: s.fetchImpl })).toEqual({
    kind: "login",
  });
  expect(await enterDashboard({ accessToken: "", fetchImpl: s.fetchImpl })).toEqual({
    kind: "login",
  });
  expect(s.calls).toHaveLength(0);
});

test("hand-off: returns to the requested dashboard page", async () => {
  const s = server(200);
  expect(
    await enterDashboard({
      accessToken: "a.b.c",
      next: "/app/c/abc/actions?from=2026-09-01",
      fetchImpl: s.fetchImpl,
    }),
  ).toEqual({ kind: "dashboard", href: "/app/c/abc/actions?from=2026-09-01" });
});

test("return path: only pages inside /app (no open redirect)", () => {
  for (const ok of ["/app", "/app/", "/app/c/x", "/app?x=1", "/app/c/x?from=1#top"]) {
    expect(safeDashboardPath(ok)).toBe(ok);
  }
  for (const bad of [
    null,
    undefined,
    "",
    "/",
    "/home",
    "/application",
    "https://evil.test/app",
    "//evil.test/app",
    "/app//evil.test",
    "/app/\\evil",
    "/app/\nSet-Cookie",
    "javascript:alert(1)",
    `/app/${"x".repeat(3000)}`,
  ]) {
    expect(safeDashboardPath(bad)).toBe("/app");
  }
});

test("sign-out: ends the dashboard session with a same-origin DELETE and never throws", async () => {
  const s = server(200);
  await endDashboardSession(s.fetchImpl);
  expect(s.calls[0]!.url).toBe("/app/api/session");
  expect(s.calls[0]!.init?.method).toBe("DELETE");
  expect(s.calls[0]!.init?.credentials).toBe("same-origin");
  await expect(endDashboardSession(server("down").fetchImpl)).resolves.toBeUndefined();
  await expect(endDashboardSession(server(500).fetchImpl)).resolves.toBeUndefined();
});

test("sign-out everywhere: the dashboard session ends first, then Supabase's", async () => {
  const order: string[] = [];
  const result = await signOutEverywhere({
    endDashboard: async () => void order.push("dashboard"),
    signOutSupabase: async () => (order.push("supabase"), { error: null }),
  });
  expect(order).toEqual(["dashboard", "supabase"]);
  expect(result).toEqual({ error: null });
});

test("sign-out everywhere: an unreachable dashboard never blocks the Supabase sign-out", async () => {
  const order: string[] = [];
  const result = await signOutEverywhere({
    endDashboard: async () => {
      order.push("dashboard");
      throw new Error("offline");
    },
    signOutSupabase: async () => (order.push("supabase"), { error: null }),
  });
  expect(order).toEqual(["dashboard", "supabase"]);
  expect(result.error).toBeNull();
  const failing = await signOutEverywhere({
    endDashboard: async () => {},
    signOutSupabase: async () => ({ error: new Error("supabase down") }),
  });
  expect(failing.error).toBeInstanceOf(Error);
});

/* ----------------------------- route rules ------------------------------ */

test("route rules: off unless ADMATE_DASHBOARD_ORIGIN is set", () => {
  expect(dashboardRouteRules(undefined)).toBeUndefined();
  expect(dashboardRouteRules("")).toBeUndefined();
  expect(dashboardRouteRules("   ")).toBeUndefined();
});

test("route rules: /app and everything under it go to the dashboard", () => {
  expect(dashboardRouteRules("https://admate-dashboard.vercel.app")).toEqual({
    "/app": { proxy: "https://admate-dashboard.vercel.app/app" },
    "/app/**": { proxy: "https://admate-dashboard.vercel.app/app/**" },
  });
  expect(dashboardRouteRules("http://localhost:3100/")).toEqual({
    "/app": { proxy: "http://localhost:3100/app" },
    "/app/**": { proxy: "http://localhost:3100/app/**" },
  });
});

test("route rules: anything but a bare http(s) origin is rejected at build time", () => {
  for (const bad of [
    "admate-dashboard.vercel.app",
    "ftp://x.test",
    "https://x.test/app",
    "https://x.test/?a=1",
  ]) {
    expect(() => dashboardRouteRules(bad)).toThrow();
  }
});
