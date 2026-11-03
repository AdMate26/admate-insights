// Which sign-in service vouches for users. Production uses Supabase (the
// default). The TikTok staging deployment sets ADMATE_AUTH_PROVIDER=neon
// (lib/auth/neon.ts), so it needs no Supabase project of its own.
export type AuthProvider = "supabase" | "neon";

export function authProvider(): AuthProvider {
  return process.env.ADMATE_AUTH_PROVIDER?.trim() === "neon" ? "neon" : "supabase";
}
