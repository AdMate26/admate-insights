/**
 * Meta Marketing API configuration — server-only.
 *
 * Reads secrets from the server environment at call time. Nothing here is ever
 * sent to the browser: values are not VITE_-prefixed, and this module is only
 * imported from server code (the analysis dispatcher / server functions).
 */

/** Graph API version used when META_API_VERSION is not set. */
export const DEFAULT_META_API_VERSION = "v24.0";

export type MetaConfig = {
  accessToken: string;
  /** Numeric ad account id, without the "act_" prefix. */
  adAccountId: string;
  apiVersion: string;
  /** Optional: enables appsecret_proof on every request. */
  appSecret: string | null;
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Returns the Meta configuration, or null when the required values are missing
 * or malformed. Callers treat null as "not configured" (a safe, explicit state).
 */
export function readMetaConfig(): MetaConfig | null {
  const accessToken = env("META_ACCESS_TOKEN");
  const rawAccount = env("META_AD_ACCOUNT_ID");
  if (!accessToken || !rawAccount) return null;

  // Accept "2474..." or "act_2474..."; reject anything else.
  const adAccountId = rawAccount.replace(/^act_/, "");
  if (!/^\d{5,25}$/.test(adAccountId)) return null;

  const version = env("META_API_VERSION") ?? DEFAULT_META_API_VERSION;
  const apiVersion = /^v\d+\.\d+$/.test(version) ? version : DEFAULT_META_API_VERSION;

  return { accessToken, adAccountId, apiVersion, appSecret: env("META_APP_SECRET") ?? null };
}
