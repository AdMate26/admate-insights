import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { userVisits } from "./db/schema";
import { cleanPath, sanitizeEvent, type AnalyticsEvent } from "./analytics-sanitize";
import { publicOrigin } from "./integration/paths";

// AdMate integration: product analytics for SIGNED-IN people, recorded by the
// server (docs/analytics.md). The browser only tells /api/activity which page
// it opened or left, over the login session people already have; no tracking
// cookie or browser storage is used. Events go to the same PostHog project
// with the person's Supabase user ID and email, grouped into visits (a new
// visit after 30 minutes without activity), and pass the same privacy filter
// as browser events. Off without NEXT_PUBLIC_POSTHOG_KEY.

export const VISIT_GAP_MS = 30 * 60 * 1000;

// production | preview | cloudrun | local (same labels as lib/analytics.ts).
function appEnv(host: string): string {
  if (host === "www.admate.site" || host === "admate.site") return "production";
  if (host === "localhost" || host === "127.0.0.1") return "local";
  if (host.endsWith(".run.app")) return "cloudrun";
  return "preview";
}
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function settings(): { key: string; host: string; origin: string } | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  const origin = publicOrigin();
  if (!key || !/^phc_[A-Za-z0-9]{20,}$/.test(key) || !/^https:\/\/[a-z0-9.-]+\.posthog\.com$/.test(host) || !origin) return null;
  return { key, host, origin };
}

export function serverAnalyticsOn(): boolean {
  return settings() !== null;
}

// A UUIDv7 (time-ordered), the session ID format PostHog expects.
export function uuidv7(at: Date): string {
  const b = randomBytes(16);
  const ms = BigInt(at.getTime());
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & BigInt(0xff));
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The person's current visit: continues it, or starts a new one after a gap.
export async function touchVisit(userId: string, now = new Date()): Promise<{ visitId: string; isNew: boolean }> {
  const db = await getDb();
  const [row] = await db.select().from(userVisits).where(eq(userVisits.userId, userId));
  if (row && now.getTime() - row.lastSeenAt.getTime() < VISIT_GAP_MS) {
    await db.update(userVisits).set({ lastSeenAt: now }).where(eq(userVisits.userId, userId));
    return { visitId: row.visitId, isNew: false };
  }
  const visitId = uuidv7(now);
  const values = { userId, visitId, startedAt: now, lastSeenAt: now };
  await db.insert(userVisits).values(values).onConflictDoUpdate({ target: userVisits.userId, set: values });
  return { visitId, isNew: true };
}

export interface ServerEvent {
  event: string;
  userId: string;
  email?: string | null;
  // Path inside the dashboard as the browser shows it, e.g. "/c/<id>/actions".
  path?: string;
  visitId?: string;
  properties?: Record<string, string | number | boolean>;
  at?: Date;
}

// Sends one event to PostHog. Never throws; a failed send is simply lost.
export async function captureServer(e: ServerEvent, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const config = settings();
  if (!config) return false;
  const origin = new URL(config.origin);
  const pathname = e.path ? cleanPath(`/app${e.path === "/" ? "" : e.path}`) : undefined;
  const raw: AnalyticsEvent = {
    event: e.event,
    properties: {
      ...e.properties,
      app: "dashboard",
      app_env: appEnv(origin.hostname),
      $lib: "admate-server",
      $geoip_disable: true,
      $process_person_profile: true,
      ...(e.visitId ? { $session_id: e.visitId } : {}),
      ...(pathname ? { $pathname: pathname, $current_url: `${origin.origin}${pathname}`, $host: origin.host } : {}),
    },
    ...(e.email ? { $set: { email: e.email } } : {}),
  };
  const clean = sanitizeEvent(raw, { ownHost: origin.hostname });
  if (!clean) return false;
  try {
    const res = await fetchImpl(`${config.host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: config.key,
        event: clean.event,
        distinct_id: e.userId,
        timestamp: (e.at ?? new Date()).toISOString(),
        properties: { ...clean.properties, ...(clean.$set ? { $set: clean.$set } : {}) },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
