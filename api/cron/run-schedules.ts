/**
 * "Run due Telegram schedules" endpoint (Vercel Function, Hobby-friendly).
 *
 * Triggered by SUPABASE CRON (pg_cron + pg_net), NOT Vercel Cron — the Vercel
 * Hobby plan cannot run a frequent cron, so the periodic trigger lives in
 * Supabase and calls this endpoint every few minutes (see
 * supabase/migrations/*_telegram_cron.sql and docs/telegram-scheduling.md).
 *
 * The caller must send `Authorization: Bearer <CRON_SECRET>`; unauthenticated
 * calls are rejected. Delivery reuses the shared dispatcher + schedule store
 * (same briefing content as Preview and Send Now). Telegram/Supabase secrets
 * stay server-side. Accepts GET or POST so either net.http_get or net.http_post
 * works from Postgres.
 *
 * This lives in /api (a Vercel platform Function) so it is a stable, callable
 * URL on the Hobby plan, independent of the framework build.
 */

import { runDueSchedules } from "../../src/lib/telegram/schedules.server";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handle(request: Request): Promise<Response> {
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

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export const config = { runtime: "nodejs" };
