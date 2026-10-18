import { eq } from "drizzle-orm";
import { isAuthorized } from "@/lib/access/policy";
import { verifySupabaseToken } from "@/lib/auth/supabase";
import { endSession, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { publicOrigin } from "@/lib/integration/paths";
import { createSampleAccount } from "@/lib/sample/load";

// Session bridge (AdMate integration, INTEGRATION.md).
//
// The website signs people in with Supabase email OTP. After sign-in its /home
// page POSTs the user's Supabase access token here. Only when the Supabase
// Auth server confirms the token AND the user is authorised (invite-only, see
// lib/access/policy.ts) does this create the dashboard's own session cookie.
// DELETE ends that session (sign-out on either side).

// Marks users created by the bridge. They never had a password; password
// sign-in no longer exists, and this value can never match a password hash.
const NO_PASSWORD = "!supabase-otp";

const noStore = { "cache-control": "no-store" };

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: noStore });
}

// Only the website itself may call the bridge (no cross-site sign-in or
// sign-out). Browsers always send Origin on POST/DELETE fetches.
function sameOrigin(request: Request): boolean {
  const origin = publicOrigin();
  if (!origin) return false;
  if (request.headers.get("origin") !== origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

export async function POST(request: Request) {
  if (!publicOrigin()) return json(503, { error: "not_configured" });
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });

  const user = await verifySupabaseToken(request.headers.get("authorization"));
  // Whatever happens next, a previous session in this browser (possibly another
  // person's) never survives a new sign-in attempt.
  await endSession();
  if (!user) return json(401, { error: "not_signed_in" });
  if (!(await isAuthorized(user.id))) return json(403, { error: "not_authorized" });

  const db = await getDb();
  const created = await db
    .insert(users)
    .values({ id: user.id, email: user.email, passwordHash: NO_PASSWORD, lastLoginAt: new Date() })
    .onConflictDoNothing({ target: users.id })
    .returning({ id: users.id });
  if (created.length === 0) {
    await db.update(users).set({ email: user.email, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  } else {
    // First entry: their own copy of the sample account, exactly as Project B
    // gave every new account at sign-up.
    await createSampleAccount(user.id);
  }

  await startSession(user.id);
  return json(200, { ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });
  await endSession();
  return json(200, { ok: true });
}
