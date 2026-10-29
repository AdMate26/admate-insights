import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { tiktokConnections } from "../db/schema";
import { readTikTokEncryptionKey, readTikTokOAuthConfig, type TikTokMcpServer } from "./config";
import { createTikTokPKCE, decryptTikTokSecret, encryptTikTokSecret } from "./crypto";
import { listAuthorizedAdvertisers, TikTokMcp, type TikTokAdvertiser } from "./mcp";
import {
  buildTikTokAuthorizationUrl,
  exchangeTikTokOAuthCode,
  fetchTikTokOAuthMetadata,
  refreshTikTokOAuthTokens,
  revokeTikTokToken,
  TikTokOAuthError,
} from "./oauth";
import { consumeAttempt, deleteConnection, listLinks, ownedWorkspace, readConnection, saveAttempt, saveConnection, saveLink } from "./store";

// TikTok connection lifecycle for one signed-in person. Tokens are decrypted
// only here, only for that person, and never returned to the browser or logged.

export type TikTokConnectErrorCode =
  | "oauth_state" // unknown, expired, replayed or other-session attempt
  | "exchange" // TikTok refused the code
  | "not_connected"
  | "reauth_required" // the 30-day authorization ended or was revoked
  | "provider" // TikTok unavailable
  | "advertiser" // not among this person's authorized advertisers
  | "workspace" // not this person's ad account
  | "sample" // the sample account never takes real data
  | "currency" // the advertiser's currency differs from the ad account's (never converted)
  | "busy" // a sync is running or just ran for this account
  | "import_limit" // the account already holds the maximum number of reports
  | "report" // TikTok's report was unusable (format, dates, size or time zone)
  | "timeout" // the sync ran out of time; nothing was written
  | "storage"; // AdMate couldn't save; the whole sync was rolled back

export class TikTokConnectError extends Error {
  constructor(public readonly code: TikTokConnectErrorCode) {
    super(`TikTok connection error: ${code}`);
    this.name = "TikTokConnectError";
  }
}

export interface Deps {
  fetcher?: typeof fetch;
  now?: () => Date;
  // Refresh the access token unless it stays valid at least this long (default 5 minutes).
  minValidMs?: number;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const clock = (deps: Deps) => (deps.now ?? (() => new Date()))();

/** Begins authorization: returns TikTok's consent URL for this person and browser session. */
export async function startTikTokConnection(userId: string, sessionToken: string, deps: Deps = {}): Promise<string> {
  const config = readTikTokOAuthConfig();
  const metadata = await fetchTikTokOAuthMetadata(config.server, deps.fetcher);
  const pkce = createTikTokPKCE();
  const verifierEnc = encryptTikTokSecret(pkce.verifier, readTikTokEncryptionKey(), userId, "verifier");
  await saveAttempt(userId, sessionToken, { stateHash: pkce.stateHash, verifierEnc, server: config.server }, clock(deps));
  return buildTikTokAuthorizationUrl({ metadata, config, state: pkce.state, challenge: pkce.challenge });
}

/** Finishes authorization from the callback: one use, same person, same session, unexpired. */
export async function completeTikTokConnection(userId: string, sessionToken: string, state: string, code: string, deps: Deps = {}) {
  const attempt = state && code ? await consumeAttempt(userId, sessionToken, state, clock(deps)) : null;
  if (!attempt) throw new TikTokConnectError("oauth_state");
  const config = readTikTokOAuthConfig();
  if (attempt.server !== config.server) throw new TikTokConnectError("oauth_state");
  const key = readTikTokEncryptionKey();
  const verifier = decryptTikTokSecret(attempt.verifierEnc, key, userId, "verifier");
  const metadata = await fetchTikTokOAuthMetadata(config.server, deps.fetcher);
  let tokens;
  try {
    tokens = await exchangeTikTokOAuthCode({ metadata, config, code, verifier, fetcher: deps.fetcher });
  } catch {
    throw new TikTokConnectError("exchange");
  }
  const now = clock(deps);
  await saveConnection(userId, {
    server: config.server,
    clientId: config.clientId,
    accessTokenEnc: encryptTikTokSecret(tokens.access_token, key, userId, "access"),
    accessExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    refreshTokenEnc: encryptTikTokSecret(tokens.refresh_token, key, userId, "refresh"),
    refreshExpiresAt: tokens.refresh_token_expires_in ? new Date(now.getTime() + tokens.refresh_token_expires_in * 1000) : null,
    scope: tokens.scope ?? "mcp:tt4b",
    connectedAt: now,
    refreshedAt: null,
  });
}

export interface TikTokConnectionStatus {
  connected: boolean;
  status: "not_connected" | "active" | "reauth_required";
  connectedAt: string | null;
  reconnectBy: string | null; // when the 30-day authorization ends
}

/** Safe status for the browser: no tokens, no TikTok identifiers. */
export async function tikTokConnectionStatus(userId: string, deps: Deps = {}): Promise<TikTokConnectionStatus> {
  const row = await readConnection(userId);
  if (!row) return { connected: false, status: "not_connected", connectedAt: null, reconnectBy: null };
  const expired = row.refreshExpiresAt !== null && row.refreshExpiresAt.getTime() <= clock(deps).getTime();
  const status = row.status === "reauth_required" || expired || !row.refreshTokenEnc ? "reauth_required" : "active";
  return { connected: status === "active", status, connectedAt: row.connectedAt.toISOString(), reconnectBy: row.refreshExpiresAt?.toISOString() ?? null };
}

async function markReauth(userId: string, version: number) {
  const db = await getDb();
  await db
    .update(tiktokConnections)
    .set({ status: "reauth_required", accessTokenEnc: null, refreshTokenEnc: null })
    .where(and(eq(tiktokConnections.userId, userId), eq(tiktokConnections.tokenVersion, version)));
}

// One refresh at a time per person inside this server instance; the database
// update only succeeds for the token version it started from, so a second
// instance refreshing at the same moment cannot overwrite newer tokens.
const inFlight = new Map<string, Promise<string>>();

/** A valid access token for this person, refreshing (with rotation) when it is about to expire. */
export async function tikTokAccessToken(userId: string, deps: Deps = {}): Promise<string> {
  const running = inFlight.get(userId);
  if (running) return running;
  const task = accessTokenOnce(userId, deps).finally(() => inFlight.delete(userId));
  inFlight.set(userId, task);
  return task;
}

async function accessTokenOnce(userId: string, deps: Deps): Promise<string> {
  const row = await readConnection(userId);
  if (!row) throw new TikTokConnectError("not_connected");
  const now = clock(deps);
  if (row.status !== "active" || !row.refreshTokenEnc) throw new TikTokConnectError("reauth_required");
  if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= now.getTime()) {
    await markReauth(userId, row.tokenVersion);
    throw new TikTokConnectError("reauth_required");
  }
  const key = readTikTokEncryptionKey();
  if (row.accessTokenEnc && row.accessExpiresAt && row.accessExpiresAt.getTime() - now.getTime() > (deps.minValidMs ?? REFRESH_MARGIN_MS)) {
    return decryptTikTokSecret(row.accessTokenEnc, key, userId, "access");
  }

  const config = readTikTokOAuthConfig();
  const metadata = await fetchTikTokOAuthMetadata(row.server as TikTokMcpServer, deps.fetcher);
  let tokens;
  try {
    tokens = await refreshTikTokOAuthTokens({
      metadata,
      config: { ...config, server: row.server as TikTokMcpServer, clientId: row.clientId },
      refreshToken: decryptTikTokSecret(row.refreshTokenEnc, key, userId, "refresh"),
      fetcher: deps.fetcher,
    });
  } catch (error) {
    if (error instanceof TikTokOAuthError && error.code === "invalid_grant") {
      await markReauth(userId, row.tokenVersion);
      throw new TikTokConnectError("reauth_required");
    }
    throw new TikTokConnectError("provider");
  }
  const db = await getDb();
  const updated = await db
    .update(tiktokConnections)
    .set({
      accessTokenEnc: encryptTikTokSecret(tokens.access_token, key, userId, "access"),
      accessExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
      refreshTokenEnc: encryptTikTokSecret(tokens.refresh_token, key, userId, "refresh"),
      // The 30-day window never grows: keep the earlier end.
      refreshExpiresAt: earliest(row.refreshExpiresAt, tokens.refresh_token_expires_in ? new Date(now.getTime() + tokens.refresh_token_expires_in * 1000) : null),
      tokenVersion: row.tokenVersion + 1,
      refreshedAt: now,
    })
    .where(and(eq(tiktokConnections.userId, userId), eq(tiktokConnections.tokenVersion, row.tokenVersion)))
    .returning({ v: tiktokConnections.tokenVersion });
  if (!updated.length) {
    // Another server refreshed first: use what it stored.
    const latest = await readConnection(userId);
    if (!latest?.accessTokenEnc || latest.status !== "active") throw new TikTokConnectError("reauth_required");
    return decryptTikTokSecret(latest.accessTokenEnc, key, userId, "access");
  }
  return tokens.access_token;
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Disconnects: revokes at TikTok (best effort), then always deletes everything stored for this person. */
export async function disconnectTikTok(userId: string, deps: Deps = {}) {
  const row = await readConnection(userId);
  if (row) {
    try {
      const key = readTikTokEncryptionKey();
      const metadata = await fetchTikTokOAuthMetadata(row.server as TikTokMcpServer, deps.fetcher);
      if (row.refreshTokenEnc) await revokeTikTokToken({ metadata, token: decryptTikTokSecret(row.refreshTokenEnc, key, userId, "refresh"), hint: "refresh_token", fetcher: deps.fetcher });
      if (row.accessTokenEnc) await revokeTikTokToken({ metadata, token: decryptTikTokSecret(row.accessTokenEnc, key, userId, "access"), hint: "access_token", fetcher: deps.fetcher });
    } catch {
      /* revocation is best effort; the local deletion below always happens */
    }
  }
  await deleteConnection(userId);
}

/** The advertisers this person authorized, read live from TikTok with their own token. */
export async function tikTokAdvertisers(userId: string, deps: Deps = {}): Promise<TikTokAdvertiser[]> {
  const row = await readConnection(userId);
  if (!row) throw new TikTokConnectError("not_connected");
  const token = await tikTokAccessToken(userId, deps);
  try {
    return await listAuthorizedAdvertisers(new TikTokMcp(row.server as TikTokMcpServer, token, deps.fetcher));
  } catch {
    throw new TikTokConnectError("provider");
  }
}

/**
 * Checks that an advertiser may feed an ad account: the account is this person's
 * own real (not sample) account, the advertiser is authorized right now at
 * TikTok, and both use the same currency (AdMate never converts money).
 * Used both when linking and before every sync.
 */
export async function checkTikTokTarget(userId: string, advertiserId: string, workspaceId: string, deps: Deps = {}): Promise<TikTokAdvertiser> {
  const ws = await ownedWorkspace(userId, workspaceId);
  if (!ws) throw new TikTokConnectError("workspace");
  if (ws.isSample) throw new TikTokConnectError("sample");
  const advertiser = (await tikTokAdvertisers(userId, deps)).find((a) => a.id === advertiserId);
  if (!advertiser) throw new TikTokConnectError("advertiser");
  if (!sameCurrency(advertiser.currency, ws.currency)) throw new TikTokConnectError("currency");
  return advertiser;
}

export const sameCurrency = (a: string | null, b: string | null) => !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/** Links one of this person's authorized advertisers to one of their own ad accounts (see checkTikTokTarget). */
export async function linkTikTokAdvertiser(userId: string, advertiserId: string, workspaceId: string, deps: Deps = {}) {
  const advertiser = await checkTikTokTarget(userId, advertiserId, workspaceId, deps);
  await saveLink(userId, { advertiserId, workspaceId, advertiserName: advertiser.name, currency: advertiser.currency, timezone: advertiser.timezone });
}

export { listLinks as tikTokAdvertiserLinks };
