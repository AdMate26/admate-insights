import "server-only";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db/client";
import { tiktokAdvertiserLinks, tiktokConnections, tiktokOauthStates, tiktokSyncs, workspaces } from "../db/schema";
import { sha256Hex } from "./crypto";

// Every function takes the signed-in person's user ID and every query filters
// by it: one person can never read, change or consume another's TikTok rows.

export const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type TikTokConnectionRow = typeof tiktokConnections.$inferSelect;
export type TikTokAdvertiserLinkRow = typeof tiktokAdvertiserLinks.$inferSelect;
export type TikTokSyncRow = typeof tiktokSyncs.$inferSelect;

/** Starts a fresh attempt; any earlier pending attempt of this person is discarded. */
export async function saveAttempt(userId: string, sessionToken: string, state: { stateHash: string; verifierEnc: string; server: string }, now = new Date()) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(tiktokOauthStates).where(eq(tiktokOauthStates.userId, userId));
    await tx.insert(tiktokOauthStates).values({
      stateHash: state.stateHash,
      userId,
      sessionHash: sha256Hex(sessionToken),
      verifierEnc: state.verifierEnc,
      server: state.server,
      expiresAt: new Date(now.getTime() + ATTEMPT_TTL_MS),
    });
  });
}

/**
 * Consumes an attempt atomically: only when the state, the person, the browser
 * session and the expiry all match. A consumed state can never be used again.
 */
export async function consumeAttempt(userId: string, sessionToken: string, state: string, now = new Date()) {
  const db = await getDb();
  const [row] = await db
    .delete(tiktokOauthStates)
    .where(
      and(
        eq(tiktokOauthStates.stateHash, sha256Hex(state)),
        eq(tiktokOauthStates.userId, userId),
        eq(tiktokOauthStates.sessionHash, sha256Hex(sessionToken)),
        gt(tiktokOauthStates.expiresAt, now),
      ),
    )
    .returning();
  return row ?? null;
}

export async function readConnection(userId: string): Promise<TikTokConnectionRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(tiktokConnections).where(eq(tiktokConnections.userId, userId));
  return row ?? null;
}

export async function saveConnection(userId: string, values: Omit<typeof tiktokConnections.$inferInsert, "userId">) {
  const db = await getDb();
  const row = { ...values, userId, status: "active", tokenVersion: 1 };
  await db.insert(tiktokConnections).values(row).onConflictDoUpdate({ target: tiktokConnections.userId, set: row });
}

export async function deleteConnection(userId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(tiktokAdvertiserLinks).where(eq(tiktokAdvertiserLinks.userId, userId));
    await tx.delete(tiktokOauthStates).where(eq(tiktokOauthStates.userId, userId));
    await tx.delete(tiktokConnections).where(eq(tiktokConnections.userId, userId));
  });
}

export async function listLinks(userId: string): Promise<TikTokAdvertiserLinkRow[]> {
  const db = await getDb();
  return db.select().from(tiktokAdvertiserLinks).where(eq(tiktokAdvertiserLinks.userId, userId));
}

/** The ad account only when it belongs to this person (currency and sample flag included). */
export async function ownedWorkspace(userId: string, workspaceId: string) {
  const db = await getDb();
  const [ws] = await db
    .select({ id: workspaces.id, currency: workspaces.currency, isSample: workspaces.isSample })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId)));
  return ws ?? null;
}

export async function saveLink(userId: string, link: Omit<typeof tiktokAdvertiserLinks.$inferInsert, "userId" | "linkedAt">) {
  const db = await getDb();
  const row = { ...link, userId, linkedAt: new Date() };
  await db.transaction(async (tx) => {
    // One advertiser per ad account, and one ad account per advertiser.
    await tx.delete(tiktokAdvertiserLinks).where(and(eq(tiktokAdvertiserLinks.userId, userId), eq(tiktokAdvertiserLinks.workspaceId, link.workspaceId)));
    await tx.insert(tiktokAdvertiserLinks).values(row).onConflictDoUpdate({ target: [tiktokAdvertiserLinks.userId, tiktokAdvertiserLinks.advertiserId], set: row });
  });
}

export async function deleteLink(userId: string, advertiserId: string) {
  const db = await getDb();
  await db.delete(tiktokAdvertiserLinks).where(and(eq(tiktokAdvertiserLinks.userId, userId), eq(tiktokAdvertiserLinks.advertiserId, advertiserId)));
}

export const SYNC_LOCK_MS = 5 * 60 * 1000; // a crashed sync frees the account after this
export const SYNC_COOLDOWN_MS = 60 * 1000; // at most one sync a minute per ad account

/**
 * Takes the account's sync lock atomically, across servers: only when no sync is
 * running and the last one finished more than a minute ago. Returns false otherwise.
 */
export async function acquireSyncLock(userId: string, advertiserId: string, workspaceId: string, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const lockedUntil = new Date(now.getTime() + SYNC_LOCK_MS);
  const cooled = new Date(now.getTime() - SYNC_COOLDOWN_MS);
  const rows = await db
    .insert(tiktokSyncs)
    .values({ workspaceId, userId, advertiserId, lockedUntil, startedAt: now })
    .onConflictDoUpdate({
      target: tiktokSyncs.workspaceId,
      set: { userId, advertiserId, lockedUntil, startedAt: now },
      setWhere: and(
        or(isNull(tiktokSyncs.lockedUntil), lt(tiktokSyncs.lockedUntil, now)),
        or(isNull(tiktokSyncs.finishedAt), lt(tiktokSyncs.finishedAt, cooled)),
      ),
    })
    .returning({ workspaceId: tiktokSyncs.workspaceId });
  return rows.length === 1;
}

/** Records the outcome and frees the lock (only this person's row for this account). */
export async function finishSync(
  userId: string,
  workspaceId: string,
  result: Pick<TikTokSyncRow, "outcome" | "errorCode" | "rows" | "periodStart" | "periodEnd"> & Partial<Pick<TikTokSyncRow, "importId" | "fingerprint">>,
  now = new Date(),
) {
  const db = await getDb();
  await db
    .update(tiktokSyncs)
    .set({ ...result, lockedUntil: null, finishedAt: now })
    .where(and(eq(tiktokSyncs.workspaceId, workspaceId), eq(tiktokSyncs.userId, userId)));
}

export async function readSync(userId: string, workspaceId: string): Promise<TikTokSyncRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(tiktokSyncs).where(and(eq(tiktokSyncs.workspaceId, workspaceId), eq(tiktokSyncs.userId, userId)));
  return row ?? null;
}

export async function listSyncs(userId: string): Promise<TikTokSyncRow[]> {
  const db = await getDb();
  return db.select().from(tiktokSyncs).where(eq(tiktokSyncs.userId, userId));
}
