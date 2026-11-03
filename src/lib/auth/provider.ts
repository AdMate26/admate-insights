/**
 * Which sign-in service this build uses. Production uses Supabase (the
 * default). The TikTok staging website is built with
 * VITE_ADMATE_AUTH_PROVIDER=neon: sign-in then goes to Neon Auth through the
 * dashboard (see neon-client.ts), and no Supabase project is needed.
 */
export type AuthProvider = "supabase" | "neon";

export const AUTH_PROVIDER: AuthProvider =
  import.meta.env["VITE_ADMATE_AUTH_PROVIDER"] === "neon" ? "neon" : "supabase";

export const usesNeonAuth = (): boolean => AUTH_PROVIDER === "neon";
