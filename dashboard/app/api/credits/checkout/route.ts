import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { BUY_AVAILABLE, startPurchase } from "@/lib/ai/credits";

const Body = z.object({ pack: z.enum(["pack_100", "pack_300"]) });

// Start buying a credit pack. Only the test checkout exists so far; a real payment
// provider plugs in here (create its checkout, return its address) and confirms the
// payment from its webhook with completePurchase().
export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick a credit pack." }, { status: 400 });
  if (!BUY_AVAILABLE) return Response.json({ error: "Buying credits is coming soon." }, { status: 503 });
  const p = await startPurchase(user.id, parsed.data.pack, "test");
  return Response.json({ ...p, test: true });
}
