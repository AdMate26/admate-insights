import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isAuthorized } from "../access/policy";
import { getDb } from "../db/client";
import { sessions, users } from "../db/schema";
import { websiteUrl } from "../integration/paths";
import { publicDemoVisitor } from "../integration/public-demo";
import { SESSION_COOKIE, SESSION_DAYS } from "./cookie";

export interface CurrentUser {
  id: string;
  email: string;
  // AdMate integration: set for a public demo visitor (not signed in). The id is
  // then the demo's system owner, so only the demo account is visible.
  readOnly?: true;
}

// The cookie carries a random token; the database only stores its hash, so a
// leaked database copy can't be used to sign in.
function sessionId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Call only from a Server Action or Route Handler (they can set cookies).
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const db = await getDb();
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  await db.insert(sessions).values({ id: sessionId(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sessionId(token)));
  }
  store.delete(SESSION_COOKIE);
}

// The signed-in user for this request, or null. Cached per request.
// AdMate integration: a valid session is not enough on its own. The user must
// still be authorised (lib/access/policy.ts) on every request; a session whose
// user lost access is deleted and treated as signed out. Without a valid
// session, a read request that proxy.ts marked gets the read-only public demo
// visitor (lib/integration/public-demo.ts); never a write or Server Action.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    const [row] = await db
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sessionId(token)), gt(sessions.expiresAt, new Date())));
    if (row) {
      if (await isAuthorized(row.id)) return row;
      await db.delete(sessions).where(eq(sessions.id, sessionId(token)));
    }
  }
  return publicDemoVisitor();
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Sign-in lives on the website: /home re-checks it and re-creates the session.
  if (!user) redirect(websiteUrl("/home"));
  return user;
}
