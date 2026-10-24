import { sendScheduled } from "@/lib/telegram";

// Scheduled Telegram alerts. Call it every hour (a Vercel cron on a paid plan, or the
// GitHub Action in .github/workflows/alerts.yml) with "Authorization: Bearer <CRON_SECRET>".
// Each person gets their message at the hour they chose, in their time zone.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  return Response.json(await sendScheduled(), { headers: { "cache-control": "no-store" } });
}
