import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { creditLedger, creditPurchases } from "../db/schema";
import { costUsd, unitsFor, type TokenUsage } from "./pricing";

// AdMate Assistant credits: one balance per person, used up by what each answer
// actually cost (tokens, priced by the model that served them) and topped up by
// buying packs. Amounts are kept in hundredths of a credit ("units").

// 1 credit = this much AI usage at Anthropic's list prices. With 20 free credits,
// $0.0125 keeps the free trial at about $0.25 of AI cost per person.
export const CREDIT_USD = Number(process.env.ADMATE_CREDIT_USD ?? 0.0125);
// The one-time beta grant (later: credits from the person's subscription plan).
export const FREE_CREDITS = Number(process.env.ADMATE_FREE_CREDITS ?? 20);
// Packs on sale. Prices in US cents.
export const PACKS = [
  { id: "pack_100", credits: 100, amountCents: 1000 },
  { id: "pack_300", credits: 300, amountCents: 2500 },
] as const;
export type PackId = (typeof PACKS)[number]["id"];
// The test checkout (no money moves). Only for local and preview testing: with it on,
// anyone signed in can add credits for free, so it must stay off in production.
export const TEST_PAYMENTS = process.env.ADMATE_TEST_PAYMENTS === "true";
// Can people buy credits? Not in the beta: only with the test checkout for now, and
// later when a payment provider (ABA PayWay) is connected.
export const BUY_AVAILABLE = TEST_PAYMENTS;

const BETA_GRANT_REF = "beta-grant";

// The balance in units, after giving the beta grant once (the unique ref makes a
// second grant a no-op, even when two requests race).
export async function creditBalance(userId: string): Promise<number> {
  const db = await getDb();
  await db
    .insert(creditLedger)
    .values({ userId, units: Math.round(FREE_CREDITS * 100), kind: "grant", ref: BETA_GRANT_REF, note: `${FREE_CREDITS} free beta credits` })
    .onConflictDoNothing();
  const [row] = await db.select({ units: sql<number>`coalesce(sum(${creditLedger.units}), 0)::int` }).from(creditLedger).where(eq(creditLedger.userId, userId));
  return Number(row?.units ?? 0);
}

// Charge one answer. Returns the units charged (0 when nothing was used).
export async function chargeAnswer(userId: string, workspaceId: string | null, usage: TokenUsage[]): Promise<{ units: number; costUsd: number }> {
  const cost = usage.reduce((s, u) => s + costUsd(u), 0);
  const units = unitsFor(cost, CREDIT_USD);
  if (units > 0) {
    const db = await getDb();
    await db.insert(creditLedger).values({ userId, units: -units, kind: "usage", workspaceId, note: `Assistant answer · $${cost.toFixed(4)}` });
  }
  return { units, costUsd: cost };
}

export async function creditHistory(userId: string, limit = 12) {
  const db = await getDb();
  return db
    .select({ units: creditLedger.units, kind: creditLedger.kind, note: creditLedger.note, createdAt: creditLedger.createdAt })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(limit);
}

// Start buying a pack: a pending purchase the payment provider (or the test checkout) completes.
export async function startPurchase(userId: string, packId: PackId, provider: string) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown pack");
  const db = await getDb();
  const id = randomUUID();
  await db.insert(creditPurchases).values({ id, userId, pack: pack.id, credits: pack.credits, amountCents: pack.amountCents, provider });
  return { purchaseId: id, pack: pack.id, credits: pack.credits, amountCents: pack.amountCents };
}

// Payment confirmed: mark the purchase paid and add its credits, exactly once.
export async function completePurchase(userId: string, purchaseId: string, providerRef: string | null = null): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .update(creditPurchases)
      .set({ status: "paid", paidAt: new Date(), providerRef })
      .where(and(eq(creditPurchases.id, purchaseId), eq(creditPurchases.userId, userId), eq(creditPurchases.status, "pending")))
      .returning();
    if (!p) return false;
    await tx
      .insert(creditLedger)
      .values({ userId, units: p.credits * 100, kind: "purchase", ref: `purchase:${p.id}`, note: `Bought ${p.credits} credits` })
      .onConflictDoNothing();
    return true;
  });
}

export async function cancelPurchase(userId: string, purchaseId: string) {
  const db = await getDb();
  await db
    .update(creditPurchases)
    .set({ status: "canceled" })
    .where(and(eq(creditPurchases.id, purchaseId), eq(creditPurchases.userId, userId), eq(creditPurchases.status, "pending")));
}
