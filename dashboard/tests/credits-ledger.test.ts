import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The credit ledger against a throwaway embedded database (PGlite in a temp folder).
vi.mock("server-only", () => ({}));
const dir = mkdtempSync(path.join(tmpdir(), "admate-credits-"));
process.env.ADMATE_DATA_DIR = dir;
delete process.env.DATABASE_URL;

type Credits = typeof import("@/lib/ai/credits");
let c: Credits;
const USER = "credits-test-user";

beforeAll(async () => {
  const { getDb } = await import("@/lib/db/client");
  const { users } = await import("@/lib/db/schema");
  await (await getDb()).insert(users).values({ id: USER, email: "credits@example.test", passwordHash: "!" });
  c = await import("@/lib/ai/credits");
}, 60_000);
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("credit ledger", () => {
  it("gives the free beta credits once", async () => {
    expect(await c.creditBalance(USER)).toBe(c.FREE_CREDITS * 100);
    expect(await c.creditBalance(USER)).toBe(c.FREE_CREDITS * 100);
    expect((await c.creditHistory(USER)).filter((h) => h.kind === "grant")).toHaveLength(1);
  });

  it("charges what an answer cost, priced by the model that served each step", async () => {
    const before = await c.creditBalance(USER);
    const r = await c.chargeAnswer(USER, "ws1", [
      { model: "claude-sonnet-5-5", input: 12_000, output: 600, cacheRead: 0, cacheWrite: 4_000 },
      { model: "claude-sonnet-5-5", input: 3_000, output: 900, cacheRead: 16_000, cacheWrite: 0 },
    ]);
    // $0.024 + $0.006 + $0.010 (cache write) + $0.006 + $0.009 + $0.0032 = $0.0582 → 4.66 credits
    expect(r.costUsd).toBeCloseTo(0.0582, 4);
    expect(r.units).toBe(466);
    expect(await c.creditBalance(USER)).toBe(before - 466);
    expect((await c.chargeAnswer(USER, "ws1", [])).units).toBe(0);
  });

  it("adds a bought pack exactly once, and nothing for a canceled one", async () => {
    const before = await c.creditBalance(USER);
    const p = await c.startPurchase(USER, "pack_100", "test");
    expect(await c.completePurchase(USER, p.purchaseId)).toBe(true);
    expect(await c.completePurchase(USER, p.purchaseId)).toBe(false);
    expect(await c.creditBalance(USER)).toBe(before + 100 * 100);
    const q = await c.startPurchase(USER, "pack_300", "test");
    await c.cancelPurchase(USER, q.purchaseId);
    expect(await c.completePurchase(USER, q.purchaseId)).toBe(false);
    expect(await c.creditBalance(USER)).toBe(before + 100 * 100);
    // Someone else can't complete another person's purchase.
    const r = await c.startPurchase(USER, "pack_100", "test");
    expect(await c.completePurchase("someone-else", r.purchaseId)).toBe(false);
  });
});
