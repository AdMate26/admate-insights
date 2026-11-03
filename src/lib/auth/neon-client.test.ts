import { describe, expect, it } from "bun:test";

import {
  getNeonToken,
  getNeonUser,
  sendNeonCode,
  signOutNeon,
  verifyNeonCode,
} from "./neon-client";

type Call = { url: string; init?: RequestInit };

function fakeFetch(answer: (url: string) => Response | Error) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const result = answer(url);
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, impl };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("Neon Auth browser client (TikTok staging)", () => {
  it("sends a sign-in code through the dashboard's relay on our own origin", async () => {
    const { calls, impl } = fakeFetch(() => json({ success: true }));
    expect(await sendNeonCode("a@example.test", impl)).toBe("ok");
    expect(calls[0]?.url).toBe("/app/api/auth/email-otp/send-verification-otp");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.credentials).toBe("same-origin");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      email: "a@example.test",
      type: "sign-in",
    });
  });

  it("signs in with the code and maps failures to the existing messages' categories", async () => {
    const ok = fakeFetch(() => json({ user: { id: "u" } }));
    expect(await verifyNeonCode("a@example.test", "123456", ok.impl)).toBe("ok");
    expect(ok.calls[0]?.url).toBe("/app/api/auth/sign-in/email-otp");
    expect(JSON.parse(String(ok.calls[0]?.init?.body))).toEqual({
      email: "a@example.test",
      otp: "123456",
    });
    for (const [status, expected] of [
      [400, "wrong_code"],
      [403, "wrong_code"],
      [429, "rate_limited"],
      [500, "failed"],
    ] as const) {
      expect(
        await verifyNeonCode("a@example.test", "000000", fakeFetch(() => json({}, status)).impl),
      ).toBe(expected);
    }
    expect(
      await verifyNeonCode("a@example.test", "1", fakeFetch(() => new Error("offline")).impl),
    ).toBe("failed");
    expect(await sendNeonCode("bad", fakeFetch(() => json({}, 400)).impl)).toBe("invalid_email");
    expect(await sendNeonCode("a@example.test", fakeFetch(() => json({}, 429)).impl)).toBe(
      "rate_limited",
    );
  });

  it("reads the confirmed user, or null when signed out or unreachable", async () => {
    const user = { id: "aaaaaaaa-1111-4222-8333-444444444444", email: "a@example.test" };
    expect(await getNeonUser(fakeFetch(() => json({ user, session: {} })).impl)).toEqual(user);
    expect(await getNeonUser(fakeFetch(() => json(null)).impl)).toBeNull();
    expect(await getNeonUser(fakeFetch(() => json({}, 401)).impl)).toBeNull();
    expect(await getNeonUser(fakeFetch(() => new Error("offline")).impl)).toBeNull();
  });

  it("gets a short-lived token for the session bridge, never from a failed answer", async () => {
    const { calls, impl } = fakeFetch(() => json({ token: "a.b.c" }));
    expect(await getNeonToken(impl)).toBe("a.b.c");
    expect(calls[0]?.url).toBe("/app/api/auth/token");
    expect(await getNeonToken(fakeFetch(() => json({ token: "a.b.c" }, 401)).impl)).toBeNull();
    expect(await getNeonToken(fakeFetch(() => json({ token: "" })).impl)).toBeNull();
  });

  it("signs out through the relay and reports a failure", async () => {
    const { calls, impl } = fakeFetch(() => json({ success: true }));
    expect((await signOutNeon(impl)).error).toBeNull();
    expect(calls[0]?.url).toBe("/app/api/auth/sign-out");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((await signOutNeon(fakeFetch(() => json({}, 500)).impl)).error).toBeTruthy();
  });
});
