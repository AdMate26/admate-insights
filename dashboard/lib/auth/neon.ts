import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { SupabaseUser as SignedInUser } from "./supabase";

// Neon Auth (TikTok staging only, ADMATE_AUTH_PROVIDER=neon). Production keeps
// Supabase (lib/auth/supabase.ts). Proven on a disposable Neon branch on
// 2026-11-03 (TIKTOK-STAGING-PLAN.md §23).
//
// The website signs people in with Neon's email code through
// /app/api/auth/* (app/api/auth/[...path]), which Neon's SDK relays to Neon
// Auth and answers with first-party, HttpOnly cookies on our own origin. The
// session bridge (app/api/session) then verifies the short-lived Neon token
// here, exactly like a Supabase token: one check per sign-in.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function neonAuthConfig(): { baseUrl: string; cookieSecret: string; jwksUrl: URL; issuer: string } | null {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim().replace(/\/+$/, "");
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!baseUrl || !cookieSecret || cookieSecret.length < 32) return null;
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return { baseUrl, cookieSecret, jwksUrl: new URL(`${baseUrl}/.well-known/jwks.json`), issuer: url.origin };
}

// Neon's published signing keys, fetched once and cached by jose.
let remoteKeys: { url: string; keys: JWTVerifyGetKey } | null = null;
function signingKeys(url: URL): JWTVerifyGetKey {
  if (remoteKeys?.url !== url.href) remoteKeys = { url: url.href, keys: createRemoteJWKSet(url) };
  return remoteKeys.keys;
}

// `authorization` is the request's Authorization header. Only a token signed by
// Neon's key (EdDSA only), with our Neon Auth's exact issuer and audience,
// unexpired, for a UUID user with an email who isn't banned, yields a user.
// Never throws and never logs the token.
export async function verifyNeonToken(authorization: string | null): Promise<SignedInUser | null> {
  const config = neonAuthConfig();
  if (!config) return null;
  const token = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "")?.[1];
  if (!token || token.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(token, signingKeys(config.jwksUrl), {
      algorithms: ["EdDSA"],
      issuer: config.issuer,
      audience: config.issuer,
      requiredClaims: ["exp", "iat", "sub"],
    });
    const id = payload.sub;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    if (payload.banned === true) return null;
    return { id, email: payload.email.trim().toLowerCase(), emailConfirmed: payload.emailVerified === true, provider: "email" };
  } catch {
    return null;
  }
}

// The only Neon Auth requests the website's sign-in needs. Everything else
// Better Auth offers (password sign-up, account changes, deletion, OAuth, admin)
// stays unreachable from the browser.
const ALLOWED: Record<string, "GET" | "POST"> = {
  "email-otp/send-verification-otp": "POST",
  "sign-in/email-otp": "POST",
  "get-session": "GET",
  token: "GET",
  "sign-out": "POST",
};

export function allowedNeonAuthRequest(method: string, path: string[]): boolean {
  const key = path.join("/");
  return Object.hasOwn(ALLOWED, key) && ALLOWED[key] === method;
}
