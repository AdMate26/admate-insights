import { requireUser } from "@/lib/auth/session";
import { checkTelegramLink } from "@/lib/telegram";

// "Connect Telegram": has the signed-in person sent their code to the bot yet?
export async function GET() {
  const user = await requireUser();
  return Response.json(await checkTelegramLink(user.id), { headers: { "cache-control": "no-store" } });
}
