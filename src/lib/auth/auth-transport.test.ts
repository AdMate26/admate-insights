import { expect, spyOn, test } from "bun:test";
import type { Session } from "@supabase/supabase-js";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabase } from "@/integrations/supabase/client";
import { startInstance } from "../../start";
import { decideWorkspaceGate, needsWorkspaceAccessCheck } from "./workspace-gate";

/* ------------------- browser → server token transport ------------------- */
// verifyOwnerAccess() reads the request's Authorization header. The browser
// sends it through ONE global function middleware, so every server function
// (getWorkspaceAccess, getAllAnalyses, getAdMateAnalysis…) carries the current
// Supabase access token as a header — never in the URL or payload.

type ClientMiddleware = (ctx: {
  next: (opts: { headers: Record<string, string> }) => unknown;
}) => Promise<unknown>;

const runClientMiddleware = async () => {
  const client = (attachSupabaseAuth as unknown as { options: { client: ClientMiddleware } })
    .options.client;
  let sent: Record<string, string> | undefined;
  await client({
    next: (opts) => {
      sent = opts.headers;
      return {};
    },
  });
  return sent;
};

const sessionWith = (accessToken: string) =>
  ({ data: { session: { access_token: accessToken } as Session }, error: null }) as never;

test("the auth middleware is registered globally for every server function", async () => {
  const options = await startInstance.getOptions();
  expect(options.functionMiddleware).toContain(attachSupabaseAuth);
});

test("the current Supabase access token is sent as an Authorization header", async () => {
  const spy = spyOn(supabase.auth, "getSession").mockResolvedValue(sessionWith("h.p.s"));
  try {
    expect(await runClientMiddleware()).toEqual({ Authorization: "Bearer h.p.s" });
  } finally {
    spy.mockRestore();
  }
});

test("signed out: no Authorization header at all (the server then denies live data)", async () => {
  const spy = spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: null },
    error: null,
  } as never);
  try {
    expect(await runClientMiddleware()).toEqual({});
  } finally {
    spy.mockRestore();
  }
});

/* ---------------------------- workspace gate ---------------------------- */

test("onboarding gate: only users who finished onboarding, or the verified owner, enter", () => {
  // Finished onboarding — unchanged behaviour.
  expect(
    decideWorkspaceGate({ onboardingComplete: true, liveBrands: [], requestedBrand: "northlane" }),
  ).toBe("allow");
  // Not finished, not the owner — still sent to onboarding (no one else unlocked).
  expect(
    decideWorkspaceGate({ onboardingComplete: false, liveBrands: [], requestedBrand: "northlane" }),
  ).toBe("onboarding");
  expect(
    decideWorkspaceGate({
      onboardingComplete: false,
      liveBrands: [],
      requestedBrand: "my_account",
    }),
  ).toBe("onboarding");
  // Not finished, but the server verified the owner — enters, demo or live.
  for (const requestedBrand of ["my_account", "northlane"] as const) {
    expect(
      decideWorkspaceGate({
        onboardingComplete: false,
        liveBrands: ["my_account"],
        requestedBrand,
      }),
    ).toBe("allow");
  }
});

test("live brand gate: a live brand without server-granted access falls back to a demo brand", () => {
  expect(
    decideWorkspaceGate({ onboardingComplete: true, liveBrands: [], requestedBrand: "my_account" }),
  ).toBe("default-brand");
  expect(
    decideWorkspaceGate({
      onboardingComplete: true,
      liveBrands: ["my_account"],
      requestedBrand: "my_account",
    }),
  ).toBe("allow");
});

test("the owner check is only requested when it can change the outcome", () => {
  expect(needsWorkspaceAccessCheck({ onboardingComplete: true, requestedBrand: "kite" })).toBe(
    false,
  );
  expect(needsWorkspaceAccessCheck({ onboardingComplete: false, requestedBrand: "kite" })).toBe(
    true,
  );
  expect(
    needsWorkspaceAccessCheck({ onboardingComplete: true, requestedBrand: "my_account" }),
  ).toBe(true);
});
