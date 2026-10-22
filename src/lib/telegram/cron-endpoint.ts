/**
 * "Run due Telegram schedules" endpoint logic.
 *
 * Triggered by SUPABASE CRON (pg_cron + pg_net) every few minutes, not Vercel
 * Cron (see supabase/migrations/*_telegram_cron.sql and
 * docs/telegram-scheduling.md). Served by the app itself at
 * /api/cron/run-schedules (src/routes/api/cron/run-schedules.ts) so it is
 * bundled with the code it imports; the old standalone Vercel function under
 * /api could not load that code and crashed on every call.
 *
 * The caller must send `Authorization: Bearer <CRON_SECRET>`; unauthenticated
 * calls are rejected. Delivery reuses the shared dispatcher + schedule store
 * (same briefing content as Preview and Send Now). Telegram/Supabase secrets
 * stay server-side. Accepts GET or POST so either net.http_get or net.http_post
 * works from Postgres.
 */

import { runDueSchedules } from "./schedules.server";

function authorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function handleCronRequest(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runDueSchedules(new Date());
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handleCronRequest;
export const POST = handleCronRequest;
