import { afterEach, beforeEach, expect, test } from "bun:test";

import { computeAnalysis } from "../telegram/dispatch.server";
import type { OwnerAccess } from "../auth/viewer.server";
import { classifyGraphError } from "./graph.server";
import { loadMetaLiveData } from "./provider.server";

const TOKEN = "EAAtest-secret-token-value";
const ACCOUNT = "2474784279286115";
const NOW = new Date("2026-10-17T05:00:00Z");
const saved: Record<string, string | undefined> = {};
// LOVABLE_API_KEY is unset so the demo path's AI step can never call out from tests.
const KEYS = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_APP_SECRET",
  "META_API_VERSION",
  "LOVABLE_API_KEY",
];

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env["META_ACCESS_TOKEN"] = TOKEN;
  process.env["META_AD_ACCOUNT_ID"] = ACCOUNT;
  delete process.env["META_APP_SECRET"];
  delete process.env["META_API_VERSION"];
  delete process.env["LOVABLE_API_KEY"];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

type Call = { url: string; auth: string | null };

/** A fake Graph API: routes by path, records every request. */
function fakeGraph(routes: Record<string, (url: URL) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url: input, auth: new Headers(init?.headers).get("authorization") });
    const path = url.pathname.replace(/^\/v\d+\.\d+\//, "");
    const route = routes[path];
    const { status = 200, body } = route
      ? route(url)
      : { status: 404, body: { error: { code: 803 } } };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

const account = {
  account_id: ACCOUNT,
  name: "My ad account",
  account_status: 1,
  currency: "USD",
  timezone_name: "Asia/Bangkok",
};

test("zero campaigns is a successful connection — no ad set / insight calls, no fake data", async () => {
  const g = fakeGraph({
    [`act_${ACCOUNT}`]: () => ({ body: account }),
    [`act_${ACCOUNT}/campaigns`]: () => ({ body: { data: [] } }),
  });
  const r = await loadMetaLiveData({ idPrefix: "my_account__", fetchImpl: g.fetchImpl, now: NOW });
  expect(r.campaigns).toEqual([]);
  expect(r.connection.status).toBe("connected");
  if (r.connection.status !== "connected") throw new Error("unreachable");
  expect(r.connection.account).toEqual({
    id: ACCOUNT,
    name: "My ad account",
    status: "Active",
    currency: "USD",
    timezone: "Asia/Bangkok",
  });
  expect(r.connection.totalCampaigns).toBe(0);
  expect(r.connection.deliveringCampaigns).toBe(0);
  // Account-local (Bangkok) today and window.
  expect(r.todayIso).toBe("2026-10-17");
  expect(r.connection.window).toEqual({ since: "2026-10-03", until: "2026-10-16" });
  expect(g.calls.map((c) => new URL(c.url).pathname)).toEqual([
    `/v24.0/act_${ACCOUNT}`,
    `/v24.0/act_${ACCOUNT}/campaigns`,
  ]);
});

test("token travels only in the Authorization header — never in any URL", async () => {
  const g = fakeGraph({
    [`act_${ACCOUNT}`]: () => ({ body: account }),
    [`act_${ACCOUNT}/campaigns`]: () => ({ body: { data: [] } }),
  });
  await loadMetaLiveData({ idPrefix: "x__", fetchImpl: g.fetchImpl, now: NOW });
  for (const call of g.calls) {
    expect(call.url).not.toContain(TOKEN);
    expect(call.url).not.toContain("access_token");
    expect(call.auth).toBe(`Bearer ${TOKEN}`);
  }
});

test("campaigns with delivery are fetched (ad sets + daily insights) and mapped", async () => {
  const g = fakeGraph({
    [`act_${ACCOUNT}`]: () => ({ body: account }),
    [`act_${ACCOUNT}/campaigns`]: () => ({
      body: {
        data: [
          { id: "1", name: "Sale", objective: "OUTCOME_SALES" },
          { id: "2", name: "Idle" },
        ],
      },
    }),
    [`act_${ACCOUNT}/adsets`]: () => ({
      body: {
        data: [
          {
            id: "a",
            campaign_id: "1",
            optimization_goal: "OFFSITE_CONVERSIONS",
            promoted_object: { custom_event_type: "PURCHASE" },
          },
        ],
      },
    }),
    [`act_${ACCOUNT}/insights`]: (url) => {
      expect(url.searchParams.get("level")).toBe("campaign");
      expect(url.searchParams.get("time_increment")).toBe("1");
      expect(JSON.parse(url.searchParams.get("time_range")!)).toEqual({
        since: "2026-10-03",
        until: "2026-10-16",
      });
      return {
        body: {
          data: [
            {
              campaign_id: "1",
              date_start: "2026-10-15",
              spend: "12",
              impressions: "900",
              inline_link_clicks: "30",
            },
          ],
        },
      };
    },
  });
  const r = await loadMetaLiveData({ idPrefix: "my_account__", fetchImpl: g.fetchImpl, now: NOW });
  expect(r.connection.status).toBe("connected");
  if (r.connection.status !== "connected") throw new Error("unreachable");
  expect(r.connection.totalCampaigns).toBe(2);
  expect(r.connection.deliveringCampaigns).toBe(1);
  expect(r.campaigns.map((c) => c.campaignId)).toEqual(["my_account__1"]);
  expect(r.campaigns[0]?.optimizationGoal).toBe("Conversions — Purchase");
});

test("pagination follows graph.facebook.com links only, and strips any token in them", async () => {
  let page = 0;
  const g = fakeGraph({
    [`act_${ACCOUNT}`]: () => ({ body: account }),
    [`act_${ACCOUNT}/campaigns`]: () => {
      page++;
      if (page === 1) {
        return {
          body: {
            data: [{ id: "1", name: "A" }],
            paging: {
              next: `https://graph.facebook.com/v24.0/act_${ACCOUNT}/campaigns?after=abc&access_token=LEAKED`,
            },
          },
        };
      }
      return {
        body: {
          data: [{ id: "2", name: "B" }],
          paging: { next: "https://evil.example.com/steal" },
        },
      };
    },
    [`act_${ACCOUNT}/adsets`]: () => ({ body: { data: [] } }),
    [`act_${ACCOUNT}/insights`]: () => ({ body: { data: [] } }),
  });
  const r = await loadMetaLiveData({ idPrefix: "x__", fetchImpl: g.fetchImpl, now: NOW });
  // The off-host "next" link aborts with a safe error instead of being followed.
  expect(r.connection.status).toBe("error");
  expect(g.calls.some((c) => c.url.includes("evil.example.com"))).toBe(false);
  expect(g.calls.some((c) => c.url.includes("LEAKED"))).toBe(false);
  expect(page).toBe(2);
});

test("expired / invalid token → safe token_invalid error (no secrets, no raw Meta text)", async () => {
  const g = fakeGraph({
    [`act_${ACCOUNT}`]: () => ({
      status: 400,
      body: {
        error: {
          message: `Error validating access token: ${TOKEN} has expired`,
          type: "OAuthException",
          code: 190,
          error_subcode: 463,
          fbtrace_id: "Ab12",
        },
      },
    }),
  });
  const r = await loadMetaLiveData({ idPrefix: "x__", fetchImpl: g.fetchImpl, now: NOW });
  expect(r.campaigns).toEqual([]);
  expect(r.connection.status).toBe("error");
  if (r.connection.status !== "error") throw new Error("unreachable");
  expect(r.connection.error.kind).toBe("token_invalid");
  expect(r.connection.error.message).toContain("invalid or has expired");
  expect(JSON.stringify(r)).not.toContain(TOKEN);
  expect(JSON.stringify(r)).not.toContain("Error validating");
});

test("permission, rate-limit and network failures map to safe kinds", async () => {
  const cases: [number | null, string][] = [
    [200, "permission"],
    [17, "rate_limited"],
    [null, "unavailable"],
  ];
  for (const [code, kind] of cases) {
    const fetchImpl =
      code === null
        ? async () => {
            throw new TypeError("fetch failed");
          }
        : async () => new Response(JSON.stringify({ error: { code } }), { status: 400 });
    const r = await loadMetaLiveData({ idPrefix: "x__", fetchImpl, now: NOW });
    expect(r.connection.status).toBe("error");
    if (r.connection.status === "error") expect(r.connection.error.kind).toBe(kind as never);
  }
});

test("error classification table", () => {
  expect(classifyGraphError(190, 463, 400)).toBe("token_invalid");
  expect(classifyGraphError(10, undefined, 400)).toBe("permission");
  expect(classifyGraphError(100, 33, 400)).toBe("not_found");
  expect(classifyGraphError(80004, undefined, 400)).toBe("rate_limited");
  expect(classifyGraphError(undefined, undefined, 503)).toBe("unavailable");
  expect(classifyGraphError(100, undefined, 400)).toBe("unknown");
});

test("missing configuration → not_configured, and no request is made", async () => {
  delete process.env["META_ACCESS_TOKEN"];
  let called = false;
  const r = await loadMetaLiveData({
    idPrefix: "x__",
    fetchImpl: async () => {
      called = true;
      return new Response("{}");
    },
    now: NOW,
  });
  expect(called).toBe(false);
  expect(r.connection.status).toBe("error");
  if (r.connection.status === "error") expect(r.connection.error.kind).toBe("not_configured");
});

test("malformed ad account id is treated as not configured", async () => {
  process.env["META_AD_ACCOUNT_ID"] = "not-a-number";
  const r = await loadMetaLiveData({
    idPrefix: "x__",
    fetchImpl: async () => new Response("{}"),
    now: NOW,
  });
  if (r.connection.status === "error") expect(r.connection.error.kind).toBe("not_configured");
  else throw new Error("expected not_configured");
});

test("appsecret_proof is added when META_APP_SECRET is set", async () => {
  process.env["META_APP_SECRET"] = "app-secret";
  const g = fakeGraph({
    [`act_${ACCOUNT}`]: () => ({ body: account }),
    [`act_${ACCOUNT}/campaigns`]: () => ({ body: { data: [] } }),
  });
  await loadMetaLiveData({ idPrefix: "x__", fetchImpl: g.fetchImpl, now: NOW });
  for (const call of g.calls)
    expect(new URL(call.url).searchParams.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
});

test("live analysis requires owner access; with it, an unconfigured account is a safe empty result", async () => {
  await expect(computeAnalysis("my_account", "meta")).rejects.toThrow();
  await expect(computeAnalysis("my_account", "meta", null)).rejects.toThrow();

  delete process.env["META_ACCESS_TOKEN"];
  const fakeAccess = { userId: "owner" } as OwnerAccess;
  const analysis = await computeAnalysis("my_account", "meta", fakeAccess);
  expect(analysis.source).toBe("meta_live");
  expect(analysis.aiStatus).toBe("disabled"); // no external AI call for live data
  expect(analysis.findings).toEqual([]);
  expect(analysis.live?.status).toBe("error");
});

test("demo analysis is unchanged in source and needs no access", async () => {
  const analysis = await computeAnalysis("northlane", "meta");
  expect(analysis.source).toBe("demo");
  expect(analysis.live).toBeNull();
  expect(analysis.findings.length).toBeGreaterThan(0);
});
