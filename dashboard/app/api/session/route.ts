import { count, eq } from "drizzle-orm";
import { isAuthorized, maxUsers, newSignupsClosed, openRegistration } from "@/lib/access/policy";
import { verifySupabaseToken } from "@/lib/auth/supabase";
import { isApprovedBetaHost } from "@/lib/tiktok/config";
import { endSession, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { publicOrigin } from "@/lib/integration/paths";
import { createSampleAccount } from "@/lib/sample/load";
import { after } from "next/server";
import { captureServer, serverAnalyticsOn } from "@/lib/analytics-server";

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
  // Open registration on the approved beta deployment admits anyone, so only an
  // email Supabase has confirmed. Production is unchanged by this check.
  if (openRegistration() && isApprovedBetaHost() && !user.emailConfirmed) return json(403, { error: "email_unverified" });
  if (!(await isAuthorized(user.id))) return json(403, { error: "not_authorized" });

  const db = await getDb();
  // Beta switches (lib/access/policy.ts): they stop new users only.
  const [known] = await db.select({ id: users.id }).from(users).where(eq(users.id, user.id));
  if (!known) {
    if (newSignupsClosed()) return json(403, { error: "signups_closed" });
    const cap = maxUsers();
    if (cap !== null && (await db.select({ n: count() }).from(users))[0].n >= cap) return json(403, { error: "signups_closed" });
  }
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
    // Analytics (signed-in usage, recorded by the server): a completed sign-up.
    if (serverAnalyticsOn()) {
      const method = user.provider === "google" ? "google" : "email_code";
      after(() => captureServer({ event: "signup_completed", userId: user.id, email: user.email, properties: { method } }));
    }
  }

  await startSession(user.id);
  // `first` lets the website count a completed sign-up (analytics, if allowed).
  return json(200, created.length > 0 ? { ok: true, first: true } : { ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });
  await endSession();
  return json(200, { ok: true });
}
