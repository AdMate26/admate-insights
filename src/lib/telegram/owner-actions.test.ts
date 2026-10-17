import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";

import { checkOwnerAccess } from "../auth/viewer.server";
import type { Brand } from "../brands";
import {
  createTelegramActions,
  TELEGRAM_ACCESS_DENIED,
  TelegramAccessError,
  type TelegramActionDeps,
} from "./owner-actions";
import type { Schedule } from "./schedule-model";
import type { StoredSchedule } from "./schedules.server";

/* ------------------------------------------------------------------------ */
/* Fixtures: a fake Supabase Auth server, Telegram sender and schedule store */
/* ------------------------------------------------------------------------ */

const OWNER = "11111111-2222-4333-8444-555555555555";
const OTHER_USER = "99999999-8888-4777-8666-555555555555";
const OWNER_JWT = "owner.jwt.token-SECRET-VALUE";
const supabase = {
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_test",
};

type AuthReply = { status: number; body: unknown } | "unreachable";

/**
 * The real owner check (checkOwnerAccess), pointed at a fake auth server — the
 * same code verifyOwnerAccess() runs for a live request's Authorization header.
 */
function ownerCheck(authorization: string | null, reply: AuthReply) {
  return () =>
    checkOwnerAccess({
      ...supabase,
      authorization,
      ownerUserId: OWNER,
      fetchImpl: async () => {
        if (reply === "unreachable") throw new Error("connect ECONNREFUSED");
        return new Response(JSON.stringify(reply.body), { status: reply.status });
      },
    });
}

const AS_OWNER = ownerCheck(`Bearer ${OWNER_JWT}`, { status: 200, body: { id: OWNER } });

function stored(brand: Brand, s: Schedule, enabled = true): StoredSchedule {
  return {
    ...s,
    brand,
    chatId: null,
    enabled,
    nextSendAt: "2026-10-20T02:00:00.000Z",
    lastSentAt: null,
    summary: `Every day at ${s.time}`,
  };
}

/** Mocked Telegram + schedule storage that records every call. */
function harness(verifyOwner: TelegramActionDeps["verifyOwner"]) {
  const calls = {
    render: 0,
    send: [] as { brand: Brand; chatId?: string | undefined }[],
    get: 0,
    upsert: 0,
    toggle: 0,
  };
  const store = new Map<Brand, StoredSchedule>([
    [
      "northlane",
      stored("northlane", {
        deliveryType: "daily",
        time: "09:00",
        timezone: "UTC",
        weekday: null,
        dayOfMonth: null,
      }),
    ],
  ]);
  const deps: TelegramActionDeps = {
    verifyOwner,
    renderBriefingText: async (brand) => {
      calls.render++;
      return `AdMate briefing for ${brand}`;
    },
    sendBrandBriefing: async (brand, chatId) => {
      calls.send.push({ brand, chatId });
      return { ok: true };
    },
    getScheduleForBrand: async (brand) => {
      calls.get++;
      return store.get(brand) ?? null;
    },
    upsertSchedule: async (brand, input) => {
      calls.upsert++;
      const s = stored(brand, input);
      store.set(brand, s);
      return s;
    },
    setScheduleEnabled: async (brand, enabled) => {
      calls.toggle++;
      const current = store.get(brand);
      if (!current) return null;
      const next = { ...current, enabled };
      store.set(brand, next);
      return next;
    },
  };
  const snapshot = () => JSON.stringify([...store.entries()]);
  return { actions: createTelegramActions(deps), calls, store, snapshot };
}

const SCHEDULE_INPUT = {
  brand: "northlane" as Brand,
  deliveryType: "weekly" as const,
  time: "16:00",
  timezone: "Asia/Phnom_Penh",
  weekday: 3,
  dayOfMonth: null,
};

/** Every protected action, called with valid input. */
function everyAction(actions: ReturnType<typeof createTelegramActions>) {
  return {
    preview: () => actions.preview({ brand: "northlane" }),
    send: () => actions.send({ brand: "northlane", chatId: "123456789" }),
    getSchedule: () => actions.getSchedule({ brand: "northlane" }),
    saveSchedule: () => actions.saveSchedule(SCHEDULE_INPUT),
    setScheduleEnabled: () => actions.setScheduleEnabled({ brand: "northlane", enabled: false }),
  };
}

// Capture all console output so tests can assert nothing sensitive is logged.
let logged: string[] = [];
const spies: { mockRestore: () => void }[] = [];
beforeEach(() => {
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    spies.push(
      spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(
          args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "),
        );
      }),
    );
  }
});
afterEach(() => {
  while (spies.length) spies.pop()?.mockRestore();
});

/* ------------------------------- the owner ------------------------------- */

test("owner can preview the exact briefing", async () => {
  const h = harness(AS_OWNER);
  expect(await h.actions.preview({ brand: "olive" })).toEqual({
    text: "AdMate briefing for olive",
  });
  expect(h.calls.render).toBe(1);
});

test("owner can send a briefing (mocked sender — no real Telegram call)", async () => {
  const h = harness(AS_OWNER);
  expect(await h.actions.send({ brand: "kite", chatId: "123456789" })).toEqual({ ok: true });
  expect(h.calls.send).toEqual([{ brand: "kite", chatId: "123456789" }]);
});

test("owner sees the sender's failure unchanged", async () => {
  const h = harness(AS_OWNER);
  const actions = createTelegramActions({
    verifyOwner: AS_OWNER,
    renderBriefingText: async () => "",
    sendBrandBriefing: async () => ({
      ok: false,
      error: "Telegram bot token is not configured yet.",
    }),
    getScheduleForBrand: async () => null,
    upsertSchedule: async () => h.store.get("northlane")!,
    setScheduleEnabled: async () => null,
  });
  expect(await actions.send({ brand: "kite" })).toEqual({
    ok: false,
    error: "Telegram bot token is not configured yet.",
  });
});

test("owner can read, create, edit, disable and re-enable schedules", async () => {
  const h = harness(AS_OWNER);

  const read = await h.actions.getSchedule({ brand: "northlane" });
  expect(read.configured).toBe(true);
  expect(read.schedule?.time).toBe("09:00");

  const saved = await h.actions.saveSchedule(SCHEDULE_INPUT);
  expect(saved.ok).toBe(true);
  expect(h.store.get("northlane")).toMatchObject({
    deliveryType: "weekly",
    time: "16:00",
    weekday: 3,
  });

  const created = await h.actions.saveSchedule({
    ...SCHEDULE_INPUT,
    brand: "kite",
    deliveryType: "monthly",
    weekday: null,
    dayOfMonth: 31,
  });
  expect(created.ok).toBe(true);
  expect(h.store.get("kite")).toMatchObject({ deliveryType: "monthly", dayOfMonth: 31 });

  expect((await h.actions.setScheduleEnabled({ brand: "northlane", enabled: false })).ok).toBe(
    true,
  );
  expect(h.store.get("northlane")?.enabled).toBe(false);
  expect((await h.actions.setScheduleEnabled({ brand: "northlane", enabled: true })).ok).toBe(true);
  expect(h.store.get("northlane")?.enabled).toBe(true);
});

test("owner input validation and storage errors behave exactly as before", async () => {
  const h = harness(AS_OWNER);
  expect(await h.actions.saveSchedule({ ...SCHEDULE_INPUT, weekday: null })).toEqual({
    ok: false,
    error: "Choose a weekday.",
  });
  expect(h.calls.upsert).toBe(0);

  const failing = createTelegramActions({
    verifyOwner: AS_OWNER,
    renderBriefingText: async () => "",
    sendBrandBriefing: async () => ({ ok: true }),
    getScheduleForBrand: async () => {
      throw new Error("db down");
    },
    upsertSchedule: async () => {
      throw new Error("db down");
    },
    setScheduleEnabled: async () => {
      throw new Error("db down");
    },
  });
  expect(await failing.getSchedule({ brand: "olive" })).toEqual({
    configured: false,
    schedule: null,
  });
  expect(await failing.saveSchedule(SCHEDULE_INPUT)).toEqual({
    ok: false,
    error: "Unable to save schedule.",
  });
  expect(await failing.setScheduleEnabled({ brand: "olive", enabled: true })).toEqual({
    ok: false,
    error: "Unable to update schedule.",
  });
});

/* ---------------------------- everyone else ----------------------------- */

const DENIED_CALLERS: [string, TelegramActionDeps["verifyOwner"]][] = [
  [
    "a signed-out visitor (no Authorization header)",
    ownerCheck(null, { status: 200, body: { id: OWNER } }),
  ],
  [
    "a signed-in non-owner",
    ownerCheck("Bearer other.user.jwt", { status: 200, body: { id: OTHER_USER } }),
  ],
  [
    "an expired or revoked session",
    ownerCheck(`Bearer ${OWNER_JWT}`, { status: 401, body: { msg: "JWT expired" } }),
  ],
  ["a malformed token", ownerCheck("Bearer not-a-jwt", { status: 200, body: { id: OWNER } })],
  [
    "a non-bearer Authorization header",
    ownerCheck(`Basic ${OWNER_JWT}`, { status: 200, body: { id: OWNER } }),
  ],
  ["an unreachable auth server", ownerCheck(`Bearer ${OWNER_JWT}`, "unreachable")],
  [
    "an auth answer without a user id",
    ownerCheck(`Bearer ${OWNER_JWT}`, { status: 200, body: {} }),
  ],
  [
    "an owner check that throws",
    async () => {
      throw new Error(`boom ${OWNER_JWT}`);
    },
  ],
];

for (const [who, verifyOwner] of DENIED_CALLERS) {
  test(`${who}: every Telegram action is refused before anything protected runs`, async () => {
    const h = harness(verifyOwner);
    const before = h.snapshot();

    for (const [name, call] of Object.entries(everyAction(h.actions))) {
      const error = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(error, name).toBeInstanceOf(TelegramAccessError);
      expect((error as Error).message, name).toBe(TELEGRAM_ACCESS_DENIED);
    }

    // No briefing built, no Telegram delivery, no schedule read or written.
    expect(h.calls).toEqual({ render: 0, send: [], get: 0, upsert: 0, toggle: 0 });
    expect(h.snapshot()).toBe(before);
  });
}

test("refusals are generic: no token, user id or internal detail in errors or logs", async () => {
  for (const [, verifyOwner] of DENIED_CALLERS) {
    const h = harness(verifyOwner);
    for (const call of Object.values(everyAction(h.actions))) {
      const error = (await call().catch((e: unknown) => e)) as Error;
      for (const secret of [
        OWNER_JWT,
        "other.user.jwt",
        OWNER,
        OTHER_USER,
        "ECONNREFUSED",
        "boom",
      ]) {
        expect(error.message).not.toContain(secret);
        expect(String(error.stack ?? "")).not.toContain(OWNER_JWT);
      }
    }
  }
  for (const line of logged) {
    expect(line).not.toContain(OWNER_JWT);
    expect(line).not.toContain("other.user.jwt");
  }
});

test("the owner's token is sent only to the auth server, never to Telegram or storage", async () => {
  const seen: string[] = [];
  const verifyOwner = () =>
    checkOwnerAccess({
      ...supabase,
      authorization: `Bearer ${OWNER_JWT}`,
      ownerUserId: OWNER,
      fetchImpl: async (url) => {
        seen.push(url);
        return new Response(JSON.stringify({ id: OWNER }), { status: 200 });
      },
    });
  const h = harness(verifyOwner);
  await h.actions.send({ brand: "northlane" });
  expect(seen).toEqual(["https://example.supabase.co/auth/v1/user"]);
  expect(JSON.stringify(h.calls)).not.toContain(OWNER_JWT);
});

/* ------------------------------- wiring --------------------------------- */

test("all five Telegram server functions go through the owner-gated actions", () => {
  const source = readFileSync(new URL("../admate.functions.ts", import.meta.url), "utf8");
  const expected: Record<string, string> = {
    previewBriefing: "preview",
    sendTelegramBriefing: "send",
    getTelegramSchedule: "getSchedule",
    saveTelegramSchedule: "saveSchedule",
    setTelegramScheduleEnabled: "setScheduleEnabled",
  };
  for (const [fn, action] of Object.entries(expected)) {
    const start = source.indexOf(`export const ${fn} = createServerFn(`);
    expect(start, fn).toBeGreaterThan(-1);
    const next = source.indexOf("export const ", start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    expect(body, fn).toContain(`telegram().${action}(data)`);
    // No direct calls to the unguarded dependencies inside the handler.
    for (const raw of [
      "renderBriefingText(",
      "sendBrandBriefing(",
      "getScheduleForBrand(",
      "upsertSchedule(",
      "setScheduleEnabled(data.brand",
    ]) {
      expect(body, `${fn} → ${raw}`).not.toContain(raw);
    }
  }
  expect(source).toContain("verifyOwner: verifyOwnerAccess");
});
