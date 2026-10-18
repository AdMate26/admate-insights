"use server";

import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth/session";
import { websiteUrl } from "@/lib/integration/paths";

// AdMate integration: password sign-up and sign-in were removed. People sign in
// on the website with Supabase email OTP; the session bridge (app/api/session)
// creates this app's session. Sign-out ends it here, then the website's /logout
// ends the Supabase session too.

export async function signOut() {
  await endSession();
  redirect(websiteUrl("/logout"));
}
