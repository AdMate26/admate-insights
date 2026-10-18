import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { goals, workspaces } from "../db/schema";
import { commitImport } from "../data/imports";
import { MEASURE_KEYS } from "../metrics/measures";
import { addDays } from "../dates";
import { generateClientRows, SAMPLE_ACCOUNT, sampleEndDate } from "./generate";

// Gives one user their own copy of the Lotus Skincare sample account, replacing
// any earlier sample of theirs (never touches their real accounts or anyone
// else's). Every new user gets this at sign-up. Returns the new account's id.
export async function createSampleAccount(ownerId: string): Promise<string> {
  const db = await getDb();
  await db.delete(workspaces).where(and(eq(workspaces.ownerId, ownerId), eq(workspaces.isSample, true)));
  const client = SAMPLE_ACCOUNT;
  const end = sampleEndDate();
  const id = randomUUID();
  await db.insert(workspaces).values({ id, ownerId, name: client.name, currency: client.currency, industry: client.industry, country: client.country ?? null, isSample: true });
  for (const g of client.goals) {
    await db.insert(goals).values({
      workspaceId: id, objective: g.objective, target: g.target ?? null, marginPct: g.marginPct ?? null,
      leadToCustomerPct: g.leadToCustomerPct ?? null, profitPerCustomer: g.profitPerCustomer ?? null,
    });
  }
  for (const [platform, rows] of generateClientRows(client, end)) {
    await commitImport(db, {
      workspaceId: id, fileName: `sample-${platform}-ads-daily.csv`, platform, level: "ad", granularity: "daily",
      period: { start: addDays(end, -89), end }, currency: client.currency, attribution: null, warnings: [], rows,
      columns: MEASURE_KEYS.filter((k) => k === "spend" || k === "impressions" || rows.some((r) => r.measures[k] !== 0)),
    });
  }
  return id;
}
