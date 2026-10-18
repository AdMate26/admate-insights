import { createHash, timingSafeEqual } from "node:crypto";
import { refreshPublicDemo } from "@/lib/integration/public-demo";

// Rebuilds the shared public demo (AdMate integration, INTEGRATION.md). Called by
// a scheduled job (Vercel Cron sends GET with "Authorization: Bearer
// $CRON_SECRET") or by hand. Never reachable by visitors: it needs the secret,
// and without CRON_SECRET (at least 32 characters) it is switched off.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) return false;
  const given = request.headers.get("authorization") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await refreshPublicDemo();
    return Response.json({ ok: true, ...result }, { status: result.status === "busy" ? 409 : 200 });
  } catch {
    return Response.json({ ok: false, error: "refresh_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
