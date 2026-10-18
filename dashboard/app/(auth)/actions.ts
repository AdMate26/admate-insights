"use server";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { endSession, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSampleAccount } from "@/lib/sample/load";

export type AuthState = { error?: string; email?: string } | undefined;

const Email = z.email().max(254);
const Password = z.string().min(8, "Use at least 8 characters for your password.").max(200);

// Only paths inside AdMate, so a crafted ?next= link can't send people elsewhere.
function safeNext(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Compared against when the email doesn't exist, so a wrong email takes as long
// as a wrong password and doesn't reveal who has an account.
let dummyHash: Promise<string> | undefined;

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const invite = process.env.ADMATE_INVITE_CODE?.trim();
  if (invite && !sameText(String(formData.get("invite") ?? "").trim(), invite)) {
    return { error: "That invite code isn't right. Ask the AdMate team for yours.", email };
  }
  if (!Email.safeParse(email).success) return { error: "Enter a valid email address.", email };
  const pw = Password.safeParse(password);
  if (!pw.success) return { error: pw.error.issues[0].message, email };

  const db = await getDb();
  const id = randomUUID();
  const created = await db
    .insert(users)
    .values({ id, email, passwordHash: await hashPassword(password), lastLoginAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created.length === 0) return { error: "There's already an account with this email. Sign in instead.", email };

  await startSession(id);
  // Every new user starts with their own copy of the Lotus Skincare sample.
  const sampleId = await createSampleAccount(id);
  redirect(`/c/${sampleId}`);
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const wrong = { error: "Wrong email or password.", email };
  if (!email || !password) return wrong;

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(password, await dummyHash);
    return wrong;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return wrong;

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await startSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
