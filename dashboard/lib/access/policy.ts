// Who may use the private dashboard.
//
// A user's access is re-checked on EVERY protected request (lib/auth/session.ts
// getCurrentUser), not only when the session is created, so revoking access
// takes effect on the next request even while a session cookie still exists.
//
// Modes (ADMATE_ACCESS):
//   "open"        Open registration (the submission MVP): every user whose email
//                 sign-in was verified by Supabase gets their own private
//                 workspace. Each user only ever sees accounts they own.
//   anything else Owner only (fail-closed default): just the verified owner
//                 (META_OWNER_USER_ID).
//
// Later, invite-only Early Access will plug in here: only an `active`
// entitlement (keyed by the same Supabase user id) grants access; `invited`,
// pending or revoked never do. No second approval store is kept here.
//
// Owner-only website features (live Meta data, Telegram) are NOT governed by
// this file; the website checks META_OWNER_USER_ID for those itself.

export type Access = { kind: "owner" } | { kind: "user" } | { kind: "denied" };

// Supabase user ids are UUIDs. Anything else (e.g. the public demo's system
// owners) can never be a signed-in user.
const SUPABASE_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function ownerUserId(): string | null {
  return process.env.META_OWNER_USER_ID?.trim() || null;
}

export function openRegistration(): boolean {
  return process.env.ADMATE_ACCESS?.trim() === "open";
}

// Open-registration switches for the self-service staging beta, both optional
// (unset = no effect). Existing users keep signing in either way.
//   ADMATE_NEW_SIGNUPS=closed  no new dashboard users
//   ADMATE_MAX_USERS=<n>       no new dashboard users once n exist
// The instant switch is Supabase Auth's "Allow new users to sign up".
export function newSignupsClosed(): boolean {
  return process.env.ADMATE_NEW_SIGNUPS?.trim() === "closed";
}

export function maxUsers(): number | null {
  const n = Number(process.env.ADMATE_MAX_USERS);
  return process.env.ADMATE_MAX_USERS?.trim() && Number.isInteger(n) && n >= 0 ? n : null;
}

// The only entitlement status that will grant access once Early Access exists.
export const GRANTING_ENTITLEMENT = "active";

export async function resolveAccess(userId: string): Promise<Access> {
  if (!SUPABASE_USER_ID.test(userId)) return { kind: "denied" };
  const owner = ownerUserId();
  if (owner && userId === owner) return { kind: "owner" };
  if (openRegistration()) return { kind: "user" };
  return { kind: "denied" };
}

export async function isAuthorized(userId: string): Promise<boolean> {
  try {
    return (await resolveAccess(userId)).kind !== "denied";
  } catch {
    return false;
  }
}
