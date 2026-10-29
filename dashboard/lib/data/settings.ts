import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getDb } from "../db/client";
import { savedViews, userSettings } from "../db/schema";
import { parseExState, type ExState } from "../explorer";
import type { Level } from "../levels";

// The signed-in person's view. AdMate has one view now, Advanced, for everyone: an
// earlier choice of Beginner or Intermediate is no longer read (saveLevel stays for
// old links that still post a choice).
export const getLevel = cache(async (): Promise<Level | null> => {
  const user = await getCurrentUser();
  return user ? "advanced" : null;
});

export async function saveLevel(userId: string, level: Level) {
  const db = await getDb();
  await db
    .insert(userSettings)
    .values({ userId, level })
    .onConflictDoUpdate({ target: userSettings.userId, set: { level, updatedAt: new Date() } });
}

// The person's saved Explorer views, newest last.
export async function listSavedViews(): Promise<{ id: string; name: string; config: ExState }[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = await getDb();
  const rows = await db.select().from(savedViews).where(eq(savedViews.userId, user.id)).orderBy(savedViews.createdAt);
  return rows.flatMap((r) => {
    const config = parseExState(r.config);
    return config ? [{ id: r.id, name: r.name, config }] : [];
  });
}
