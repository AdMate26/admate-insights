import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { getDb } from "../db/client";
import { savedViews, userSettings } from "../db/schema";
import { parseExState, type ExState } from "../explorer";
import { DEMO_LEVEL_COOKIE, isLevel, type Level } from "../levels";

// The signed-in person's view, or null until they answer the welcome question.
export const getLevel = cache(async (): Promise<Level | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  // AdMate integration: a public demo visitor's view is kept in a cookie.
  if (user.readOnly) {
    const v = (await cookies()).get(DEMO_LEVEL_COOKIE)?.value;
    return isLevel(v) ? v : null;
  }
  const db = await getDb();
  const [row] = await db.select({ level: userSettings.level }).from(userSettings).where(eq(userSettings.userId, user.id));
  return row && isLevel(row.level) ? row.level : null;
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
