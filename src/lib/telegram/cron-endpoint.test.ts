import { afterAll, beforeEach, expect, mock, test } from "bun:test";

/* -------------------------------------------------------------------------- */
/* The scheduled cron endpoint keeps working WITHOUT a user session            */
/* -------------------------------------------------------------------------- */
// The cron endpoint (cron-endpoint.ts) is authorised by CRON_SECRET only. The schedule
// runner is mocked, so no database is read and no Telegram message is sent.

let runs: Date[] = [];
// Bun shares mocked modules across test files in one run, so the mock defines
// every export; anything other than the runner must never be reached here.
const unused = (name: string) => async () => {
  throw new Error(`${name} is not used by the cron endpoint test`);
};
mock.module("./schedules.server", () => ({
  runDueSchedules: async (now: Date) => {
    runs.push(now);
    return { checked: 2, sent: 1, results: [{ brand: "northlane", ok: true }] };
  },
  getScheduleForBrand: unused("getScheduleForBrand"),
  upsertSchedule: unused("upsertSchedule"),
  setScheduleEnabled: unused("setScheduleEnabled"),
}));

const { GET, POST } = await import("./cron-endpoint");

const SECRET = "test-cron-secret-value";
const ORIGINAL = process.env["CRON_SECRET"];
const url = "https://admate.example/api/cron/run-schedules";
const call = (handler: typeof GET, authorization?: string) =>
  handler(new Request(url, { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  runs = [];
  process.env["CRON_SECRET"] = SECRET;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env["CRON_SECRET"];
  else process.env["CRON_SECRET"] = ORIGINAL;
});

test("cron: the correct CRON_SECRET runs due schedules (GET and POST), no session needed", async () => {
  for (const handler of [GET, POST]) {
    const res = await call(handler, `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; checked: number; sent: number };
    expect(body).toMatchObject({ ok: true, checked: 2, sent: 1 });
  }
  expect(runs.length).toBe(2);
});

test("cron: a missing, wrong or user-session Authorization is rejected without running", async () => {
  for (const auth of [undefined, "Bearer wrong", `Basic ${SECRET}`, "Bearer owner.jwt.token"]) {
    const res = await call(GET, auth);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
  }
  expect(runs.length).toBe(0);
});

test("cron: with no CRON_SECRET configured every call is rejected", async () => {
  delete process.env["CRON_SECRET"];
  expect((await call(GET, "Bearer ")).status).toBe(401);
  expect((await call(GET, "Bearer undefined")).status).toBe(401);
  expect(runs.length).toBe(0);
});
