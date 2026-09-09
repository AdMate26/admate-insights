/**
 * Vercel Cron endpoint — "run due Telegram schedules".
 *
 * Configured in vercel.json to run on an interval. Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set, so
 * we require it here — the endpoint is server-side only and never trusts an
 * unauthenticated caller. Delivery reuses the shared dispatcher + schedule store
 * (same briefing content as Preview and Send Now). Telegram/Supabase secrets
 * stay server-side.
 *
 * This lives in /api (a Vercel platform Function) rather than in the app router
 * so it is a stable, cron-callable URL independent of the framework build.
 */

import { runDueSchedules } from "../../src/lib/telegram/schedules.server";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const summary = await runDueSchedules(new Date());
    return Response.json({ ok: true, ranAt: new Date().toISOString(), ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

// Allow Vercel Cron (and manual GET) only.
export const config = { runtime: "nodejs" };
