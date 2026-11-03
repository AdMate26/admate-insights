import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db/client";
import type { Tx } from "../data/imports";
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

// A run must finish reading within SYNC_BUDGET_MS; the lock lasts longer, so it can
// never lapse while its holder is still allowed to write (and frees the account
// if a server crashes mid-sync).
// 3 minutes: well inside Vercel's 300-second function limit (the sync runs in
// the background after Sync Now answers; see app/api/tiktok/sync/route.ts).
export const SYNC_BUDGET_MS = 3 * 60 * 1000;
// Longer than the longest possible run (Vercel stops the function at 300 s), so
// a live run always holds it; a run cut off by the platform frees the account
// about a minute after it could last have been working.
export const SYNC_LOCK_MS = 6 * 60 * 1000;
export const SYNC_COOLDOWN_MS = 60 * 1000; // at most one sync a minute per ad account

/**
 * Takes the account's sync lock atomically, across servers: only when no sync is
 * running and the last one finished more than a minute ago. Returns this run's
 * lock token, or null when the account is busy.
 */
export async function acquireSyncLock(userId: string, advertiserId: string, workspaceId: string, now = new Date()): Promise<string | null> {
  const db = await getDb();
  const lockToken = randomUUID();
  const lockedUntil = new Date(now.getTime() + SYNC_LOCK_MS);
  const cooled = new Date(now.getTime() - SYNC_COOLDOWN_MS);
  const rows = await db
    .insert(tiktokSyncs)
    .values({ workspaceId, userId, advertiserId, lockedUntil, lockToken, startedAt: now })
    .onConflictDoUpdate({
      target: tiktokSyncs.workspaceId,
      set: { userId, advertiserId, lockedUntil, lockToken, startedAt: now },
      setWhere: and(
        or(isNull(tiktokSyncs.lockedUntil), lt(tiktokSyncs.lockedUntil, now)),
        or(isNull(tiktokSyncs.finishedAt), lt(tiktokSyncs.finishedAt, cooled)),
      ),
    })
    .returning({ workspaceId: tiktokSyncs.workspaceId });
  return rows.length === 1 ? lockToken : null;
}

/**
 * Inside the import's transaction: confirms this run still holds an unexpired
 * lock (and extends it), so a run that lost its lock can never write. The row
 * lock also makes a competing run wait until this transaction ends.
 */
export async function holdSyncLock(tx: Tx, workspaceId: string, lockToken: string, now = new Date()): Promise<boolean> {
  const rows = await tx
    .update(tiktokSyncs)
    .set({ lockedUntil: new Date(now.getTime() + SYNC_LOCK_MS) })
    .where(and(eq(tiktokSyncs.workspaceId, workspaceId), eq(tiktokSyncs.lockToken, lockToken), gt(tiktokSyncs.lockedUntil, now)))
    .returning({ workspaceId: tiktokSyncs.workspaceId });
  return rows.length === 1;
}

/** Records the outcome and frees the lock, only if this run still holds it. */
export async function finishSync(
  userId: string,
  workspaceId: string,
  lockToken: string,
  result: Pick<TikTokSyncRow, "outcome" | "errorCode" | "rows" | "periodStart" | "periodEnd"> & Partial<Pick<TikTokSyncRow, "importId" | "fingerprint" | "summary">>,
  now = new Date(),
) {
  const db = await getDb();
  await db
    .update(tiktokSyncs)
    .set({ ...result, lockedUntil: null, lockToken: null, finishedAt: now })
    .where(and(eq(tiktokSyncs.workspaceId, workspaceId), eq(tiktokSyncs.userId, userId), eq(tiktokSyncs.lockToken, lockToken)));
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
