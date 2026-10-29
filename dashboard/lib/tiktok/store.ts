import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db/client";
import { tiktokAdvertiserLinks, tiktokConnections, tiktokOauthStates, workspaces } from "../db/schema";
import { sha256Hex } from "./crypto";

// Every function takes the signed-in person's user ID and every query filters
// by it: one person can never read, change or consume another's TikTok rows.

export const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type TikTokConnectionRow = typeof tiktokConnections.$inferSelect;
export type TikTokAdvertiserLinkRow = typeof tiktokAdvertiserLinks.$inferSelect;

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

/** True only when the ad account (workspace) belongs to this person. */
export async function ownsWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const db = await getDb();
  const [ws] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId)));
  return !!ws;
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
