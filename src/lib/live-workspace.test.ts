import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LiveConnectionPanel } from "../components/admate/LiveConnectionPanel";
import { checkOwnerAccess } from "./auth/viewer.server";
import { BRANDS, isBrand, isLiveBrand, isWorkspaceBrand, LIVE_BRANDS, brandMeta } from "./brands";
import { validateDashboardSearch, validateWorkspaceSearch } from "./dashboard-search";

/* ----------------------------- owner check ------------------------------ */

const OWNER = "11111111-2222-4333-8444-555555555555";
const JWT = "aaa.bbb.ccc";
const base = {
  ownerUserId: OWNER,
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_test",
};

function authServer(status: number, body: unknown) {
  const seen: { url: string; headers: Headers }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen.push({ url, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), { status });
  };
  return { seen, fetchImpl };
}

test("owner check: the verified owner gets access (validated by the auth server)", async () => {
  const s = authServer(200, { id: OWNER });
  const access = await checkOwnerAccess({
    ...base,
    authorization: `Bearer ${JWT}`,
    fetchImpl: s.fetchImpl,
  });
  expect(access?.userId).toBe(OWNER);
  expect(s.seen[0]?.url).toBe("https://example.supabase.co/auth/v1/user");
  expect(s.seen[0]?.headers.get("authorization")).toBe(`Bearer ${JWT}`);
});

test("owner check: other users, bad tokens, auth failures and missing config are denied", async () => {
  const other = authServer(200, { id: "someone-else" });
  expect(
    await checkOwnerAccess({ ...base, authorization: `Bearer ${JWT}`, fetchImpl: other.fetchImpl }),
  ).toBeNull();

  const rejected = authServer(401, { msg: "invalid JWT" });
  expect(
    await checkOwnerAccess({
      ...base,
      authorization: `Bearer ${JWT}`,
      fetchImpl: rejected.fetchImpl,
    }),
  ).toBeNull();

  const never = authServer(200, { id: OWNER });
  expect(
    await checkOwnerAccess({ ...base, authorization: null, fetchImpl: never.fetchImpl }),
  ).toBeNull();
  expect(
    await checkOwnerAccess({
      ...base,
      authorization: "Bearer not-a-jwt",
      fetchImpl: never.fetchImpl,
    }),
  ).toBeNull();
  expect(
    await checkOwnerAccess({ ...base, authorization: `Basic ${JWT}`, fetchImpl: never.fetchImpl }),
  ).toBeNull();
  expect(never.seen).toHaveLength(0); // no auth call without a plausible token

  for (const missing of ["ownerUserId", "supabaseUrl", "publishableKey"] as const) {
    expect(
      await checkOwnerAccess({
        ...base,
        [missing]: undefined,
        authorization: `Bearer ${JWT}`,
        fetchImpl: never.fetchImpl,
      }),
    ).toBeNull();
  }

  const offline = async () => {
    throw new TypeError("network down");
  };
  expect(
    await checkOwnerAccess({ ...base, authorization: `Bearer ${JWT}`, fetchImpl: offline }),
  ).toBeNull();
});

/* ---------------------------- brand isolation --------------------------- */

test("demo brands are unchanged; the live brand is separate and never a demo brand", () => {
  expect(BRANDS.map((b) => b.id)).toEqual(["northlane", "olive", "kite"]);
  expect(isBrand("my_account")).toBe(false);
  expect(isLiveBrand("my_account")).toBe(true);
  expect(isWorkspaceBrand("my_account")).toBe(true);
  expect(isWorkspaceBrand("northlane")).toBe(true);
  expect(LIVE_BRANDS.map((b) => b.id)).toEqual(["my_account"]);
  expect(brandMeta("my_account")).toMatchObject({
    label: "My Account",
    platforms: ["meta"],
    live: true,
  });
});

// Route validators receive raw URL search params; model that in the tests.
type RawSearch = Parameters<typeof validateWorkspaceSearch>[0];
const raw = (params: Record<string, unknown>) => params as RawSearch;

test("/demo can never select the live brand; the workspace can", () => {
  expect(validateDashboardSearch(raw({ brand: "my_account" })).brand).toBe("northlane");
  expect(validateDashboardSearch(raw({ brand: "olive" })).brand).toBe("olive");
  const ws = validateWorkspaceSearch(raw({ brand: "my_account", platform: "tiktok" }));
  expect(ws.brand).toBe("my_account");
  expect(ws.platform).toBe("meta"); // clamped to the live brand's only platform
});

/* --------------------------- connection panel --------------------------- */

test("connection panel: connected account with no campaigns says so (no sample data)", () => {
  const html = renderToStaticMarkup(
    LiveConnectionPanel({
      connection: {
        provider: "meta",
        status: "connected",
        account: {
          id: "2474784279286115",
          name: "My ad account",
          status: "Active",
          currency: "USD",
          timezone: "Asia/Bangkok",
        },
        totalCampaigns: 0,
        deliveringCampaigns: 0,
        window: { since: "2026-10-03", until: "2026-10-16" },
        checkedAt: "2026-10-17T00:00:00Z",
      },
    }),
  );
  expect(html).toContain("Connected to Meta · My ad account");
  expect(html).toContain("ID 2474784279286115");
  expect(html).toContain("No campaigns in this ad account yet.");
  expect(html).toContain("no sample data is shown");
});

test("connection panel: errors show only the safe message", () => {
  const html = renderToStaticMarkup(
    LiveConnectionPanel({
      connection: {
        provider: "meta",
        status: "error",
        error: {
          kind: "token_invalid",
          message: "The Meta access token is invalid or has expired.",
        },
        checkedAt: "2026-10-17T00:00:00Z",
      },
    }),
  );
  expect(html).toContain("We couldn&#x27;t load your Meta ad account");
  expect(html).toContain("invalid or has expired");
});
