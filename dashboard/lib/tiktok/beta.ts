import "server-only";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { tiktokBetaEvents, tiktokConnections } from "../db/schema";
import { tiktokAccessMode } from "./config";

// Self-service TikTok beta (staging only, tiktokAccessMode "open-beta"): the
// switches and limits that replace the hand-kept tester allowlist. They apply
// only in the open beta; the allowlist mode keeps its known testers unlimited.
//
// Switches (environment, take effect on the next deployment):
//   TIKTOK_BETA_CONNECTIONS=closed  no new TikTok authorizations (reconnects
//                                   included); existing connections keep
//                                   working and can always disconnect.
//   TIKTOK_CONNECT_ENABLED=false    TikTok off entirely (every route 404).
//   TIKTOK_BETA_MAX_CONNECTIONS     how many people may hold a connection.
// Registration itself is switched off in Supabase Auth (instant) or with
// ADMATE_NEW_SIGNUPS=closed (lib/access/policy.ts).

export const BETA_LIMITS = {
  connectsPerHour: 5, // authorization starts per person
  syncsPerHour: 6, // Sync Now starts per person (each account also waits a minute)
  syncsPerDay: 24,
  maxConnections: 25, // people holding a TikTok connection at once
} as const;

export type BetaRefusal = "connect_closed" | "connect_limit" | "beta_full" | "sync_limit";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function isOpenBeta(env: NodeJS.ProcessEnv = process.env): boolean {
  return tiktokAccessMode(env) === "open-beta";
}

function maxConnections(env: NodeJS.ProcessEnv): number {
  const n = Number(env.TIKTOK_BETA_MAX_CONNECTIONS);
  return Number.isInteger(n) && n >= 0 ? n : BETA_LIMITS.maxConnections;
}

async function eventsSince(userId: string, kind: "connect" | "sync", since: Date): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(tiktokBetaEvents)
    .where(and(eq(tiktokBetaEvents.userId, userId), eq(tiktokBetaEvents.kind, kind), gte(tiktokBetaEvents.createdAt, since)));
  return n;
}

/** Before a TikTok authorization starts: null when it may start. */
export async function betaConnectRefusal(userId: string, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<BetaRefusal | null> {
  if (!isOpenBeta(env)) return null;
  if (env.TIKTOK_BETA_CONNECTIONS?.trim() === "closed") return "connect_closed";
  if ((await eventsSince(userId, "connect", new Date(now.getTime() - HOUR))) >= BETA_LIMITS.connectsPerHour) return "connect_limit";
  const db = await getDb();
  const [own] = await db.select({ userId: tiktokConnections.userId }).from(tiktokConnections).where(eq(tiktokConnections.userId, userId));
  if (!own) {
    const [{ n }] = await db.select({ n: count() }).from(tiktokConnections);
    if (n >= maxConnections(env)) return "beta_full";
  }
  return null;
}

/** Before a sync starts: null when it may start. */
export async function betaSyncRefusal(userId: string, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<BetaRefusal | null> {
  if (!isOpenBeta(env)) return null;
  if ((await eventsSince(userId, "sync", new Date(now.getTime() - HOUR))) >= BETA_LIMITS.syncsPerHour) return "sync_limit";
  if ((await eventsSince(userId, "sync", new Date(now.getTime() - DAY))) >= BETA_LIMITS.syncsPerDay) return "sync_limit";
  return null;
}

/** Counts an accepted start toward the limits; this person's rows older than a day are dropped. */
export async function recordBetaEvent(userId: string, kind: "connect" | "sync", now: Date, env: NodeJS.ProcessEnv = process.env) {
  if (!isOpenBeta(env)) return;
  const db = await getDb();
  await db.delete(tiktokBetaEvents).where(and(eq(tiktokBetaEvents.userId, userId), lt(tiktokBetaEvents.createdAt, new Date(now.getTime() - DAY))));
  await db.insert(tiktokBetaEvents).values({ userId, kind, createdAt: now });
}
