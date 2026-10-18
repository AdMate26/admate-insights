import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../db/client";
import { imports, users, workspaces } from "../db/schema";
import { SAMPLE_ACCOUNT } from "../sample/generate";
import { createSampleAccount } from "../sample/load";

// The public demo (AdMate integration, INTEGRATION.md).
//
// One shared copy of the original Lotus Skincare sample, built by the original
// createSampleAccount() and owned by a reserved system user. Visitors who are
// not signed in get a read-only "visitor" identity equal to that system user,
// so the original ownership check (getWorkspace) shows them that account and
// nothing else.
//
// Two system users take turns so a refresh never shows a half-built demo: the
// new copy is built under the owner that is NOT current, and the old one is
// deleted only once the new one is complete. The current demo is always the
// oldest COMPLETE system-owned sample. System users have no password and are not
// Supabase user ids, so nobody can ever sign in as them.

export const DEMO_OWNERS = ["public-demo-a", "public-demo-b"] as const;
const NO_PASSWORD = "!system-public-demo";
// Complete = one import per platform in the original sample.
const SAMPLE_PLATFORMS = new Set(SAMPLE_ACCOUNT.campaigns.map((c) => c.platform)).size;
// Set by proxy.ts on read requests only; never trusted from the browser (proxy
// removes any copy the browser sends).
export const VISITOR_HEADER = "x-admate-public-demo";

export async function currentDemo(): Promise<{ id: string; ownerId: string } | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: workspaces.id, ownerId: workspaces.ownerId, n: sql<number>`count(${imports.id})::int` })
    .from(workspaces)
    .leftJoin(imports, and(eq(imports.workspaceId, workspaces.id), eq(imports.status, "active")))
    .where(and(inArray(workspaces.ownerId, [...DEMO_OWNERS]), eq(workspaces.isSample, true)))
    .groupBy(workspaces.id)
    .orderBy(asc(workspaces.createdAt));
  const done = rows.find((r) => Number(r.n) >= SAMPLE_PLATFORMS);
  return done && done.ownerId ? { id: done.id, ownerId: done.ownerId } : null;
}

// The read-only identity for a visitor on a read request, or null.
export async function publicDemoVisitor(): Promise<{ id: string; email: string; readOnly: true } | null> {
  const h = await headers();
  if (h.get(VISITOR_HEADER) !== "1" || h.has("next-action")) return null;
  const demo = await currentDemo();
  return demo ? { id: demo.ownerId, email: "", readOnly: true } : null;
}

export type RefreshResult = { status: "refreshed"; id: string } | { status: "busy" };

// One refresh at a time: a lease row (a system user that can never sign in)
// claimed atomically; a crashed refresh's lease expires after 10 minutes.
const LEASE = "public-demo-refresh-lease";

async function claimLease(): Promise<boolean> {
  const db = await getDb();
  const claimed = await db
    .insert(users)
    .values({ id: LEASE, email: `${LEASE}@system.admate.invalid`, passwordHash: NO_PASSWORD, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: users.id,
      set: { lastLoginAt: new Date() },
      setWhere: sql`${users.lastLoginAt} is null or ${users.lastLoginAt} < now() - interval '10 minutes'`,
    })
    .returning({ id: users.id });
  return claimed.length > 0;
}

async function releaseLease() {
  const db = await getDb();
  await db.update(users).set({ lastLoginAt: null }).where(eq(users.id, LEASE));
}

// Builds a fresh public demo next to the current one and switches to it. Only
// ever touches the two system users' sample accounts.
export async function refreshPublicDemo(): Promise<RefreshResult> {
  const db = await getDb();
  for (const id of DEMO_OWNERS) {
    await db.insert(users).values({ id, email: `${id}@system.admate.invalid`, passwordHash: NO_PASSWORD }).onConflictDoNothing();
  }
  if (!(await claimLease())) return { status: "busy" };
  try {
    const current = await currentDemo();
    const next = current?.ownerId === DEMO_OWNERS[0] ? DEMO_OWNERS[1] : DEMO_OWNERS[0];
    const previous = next === DEMO_OWNERS[0] ? DEMO_OWNERS[1] : DEMO_OWNERS[0];
    const id = await createSampleAccount(next); // also clears any half-built copy of `next`
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(imports)
      .where(and(eq(imports.workspaceId, id), eq(imports.status, "active")));
    if (Number(n) < SAMPLE_PLATFORMS) throw new Error("public demo build incomplete");
    await db.delete(workspaces).where(and(eq(workspaces.ownerId, previous), eq(workspaces.isSample, true)));
    return { status: "refreshed", id };
  } finally {
    await releaseLease();
  }
}
