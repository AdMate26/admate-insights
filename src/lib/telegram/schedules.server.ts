/**
 * Telegram schedule persistence + the "run due schedules" executor.
 *
 * Storage is the existing Supabase (service-role) so schedules survive browser
 * refresh/close and are read server-side by the Vercel cron endpoint. All
 * next-run math comes from the shared, timezone-aware schedule model, and every
 * send goes through the ONE dispatcher — no separate Telegram implementation.
 */

import { supabaseAdmin } from "../../integrations/supabase/client.server";
import type { Brand } from "../brands";
import { isBrand } from "../brands";
import { sendBrandBriefing } from "./dispatch.server";
import {
  computeNextRun,
  humanizeSchedule,
  isDue,
  type DeliveryType,
  type Schedule,
} from "./schedule-model";

const TABLE = "telegram_schedules";

// The generated Supabase `Database` type predates this table, so access it
// through a loosely-typed handle. (Runtime is unaffected; the SQL migration
// defines the real columns.)
function db() {
  return (supabaseAdmin as unknown as {
    from: (t: string) => any;
  }).from(TABLE);
}

export type StoredSchedule = Schedule & {
  brand: Brand;
  chatId: string | null;
  enabled: boolean;
  nextSendAt: string | null;
  lastSentAt: string | null;
  /** Human-readable summary, e.g. "Every Wednesday at 4:00 PM". */
  summary: string;
};

type Row = {
  brand: string;
  delivery_type: DeliveryType;
  time: string;
  timezone: string;
  weekday: number | null;
  day_of_month: number | null;
  chat_id: string | null;
  enabled: boolean;
  next_send_at: string | null;
  last_sent_at: string | null;
};

function rowToSchedule(r: Row): StoredSchedule {
  const s: Schedule = {
    deliveryType: r.delivery_type,
    time: r.time,
    timezone: r.timezone,
    weekday: r.weekday,
    dayOfMonth: r.day_of_month,
  };
  return {
    ...s,
    brand: (isBrand(r.brand) ? r.brand : "northlane") as Brand,
    chatId: r.chat_id,
    enabled: r.enabled,
    nextSendAt: r.next_send_at,
    lastSentAt: r.last_sent_at,
    summary: humanizeSchedule(s),
  };
}

/** The saved schedule for a brand, or null if none exists. */
export async function getScheduleForBrand(brand: Brand): Promise<StoredSchedule | null> {
  const { data, error } = await db().select("*").eq("brand", brand).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSchedule(data as Row) : null;
}

/** Create or replace the brand's schedule (one active schedule per brand). */
export async function upsertSchedule(
  brand: Brand,
  input: Schedule & { chatId?: string | null },
  now: Date = new Date(),
): Promise<StoredSchedule> {
  const next = computeNextRun(input, now).toISOString();
  const row: Row = {
    brand,
    delivery_type: input.deliveryType,
    time: input.time,
    timezone: input.timezone,
    weekday: input.deliveryType === "weekly" ? (input.weekday ?? 0) : null,
    day_of_month: input.deliveryType === "monthly" ? (input.dayOfMonth ?? 1) : null,
    chat_id: input.chatId ?? null,
    enabled: true,
    next_send_at: next,
    last_sent_at: null,
  };
  const { data, error } = await db().upsert(row, { onConflict: "brand" }).select("*").single();
  if (error) throw new Error(error.message);
  return rowToSchedule(data as Row);
}

/** Enable/disable without losing the schedule definition. */
export async function setScheduleEnabled(
  brand: Brand,
  enabled: boolean,
  now: Date = new Date(),
): Promise<StoredSchedule | null> {
  const current = await getScheduleForBrand(brand);
  if (!current) return null;
  // Re-arm nextSendAt when re-enabling so a disabled gap doesn't fire instantly.
  const next = enabled ? computeNextRun(current, now).toISOString() : current.nextSendAt;
  const { data, error } = await db()
    .update({ enabled, next_send_at: next })
    .eq("brand", brand)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToSchedule(data as Row);
}

export type RunSummary = {
  checked: number;
  sent: number;
  results: { brand: string; ok: boolean; error?: string }[];
};

/**
 * Send every schedule whose nextSendAt has passed, then roll nextSendAt forward.
 * Called by the Vercel cron endpoint. A send failure does not advance the clock,
 * so the next cron tick retries.
 */
export async function runDueSchedules(now: Date = new Date()): Promise<RunSummary> {
  const { data, error } = await db()
    .select("*")
    .eq("enabled", true)
    .lte("next_send_at", now.toISOString());
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const results: RunSummary["results"] = [];
  let sent = 0;

  for (const r of rows) {
    const brand = (isBrand(r.brand) ? r.brand : null) as Brand | null;
    if (!brand || !isDue(r.next_send_at, r.enabled, now)) continue;
    const res = await sendBrandBriefing(brand, r.chat_id ?? undefined);
    if (res.ok) {
      sent++;
      const next = computeNextRun(rowToSchedule(r), now).toISOString();
      await db().update({ last_sent_at: now.toISOString(), next_send_at: next }).eq("brand", brand);
      results.push({ brand, ok: true });
    } else {
      results.push({ brand, ok: false, error: res.error });
    }
  }

  return { checked: rows.length, sent, results };
}
