import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { neonAuthConfig } from "./neon";

// Neon's SDK relay for /api/auth/* (app/api/auth/[...path]). Kept apart from
// lib/auth/neon.ts so only that route loads the SDK.
type Handler = ReturnType<ReturnType<typeof createNeonAuth>["handler"]>;
let handler: { url: string; api: Handler } | null = null;

export function neonAuthHandler(): Handler | null {
  const config = neonAuthConfig();
  if (!config) return null;
  if (handler?.url !== config.baseUrl) {
    const auth = createNeonAuth({ baseUrl: config.baseUrl, cookies: { secret: config.cookieSecret, sameSite: "lax" } });
    handler = { url: config.baseUrl, api: auth.handler() };
  }
  return handler.api;
}
