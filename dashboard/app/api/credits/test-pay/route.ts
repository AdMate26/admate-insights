import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { cancelPurchase, completePurchase, creditBalance, TEST_PAYMENTS } from "@/lib/ai/credits";

const Body = z.object({ purchaseId: z.string().uuid(), action: z.enum(["pay", "cancel"]) });

// The test checkout's "Pay" and "Cancel": no money moves. Off unless ADMATE_TEST_PAYMENTS
// is "true" (local and preview only); with it on anyone signed in could add credits free.
export async function POST(request: Request) {
  if (!TEST_PAYMENTS) return Response.json({ error: "Test payments are off." }, { status: 404 });
  const user = await requireUser();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  if (parsed.data.action === "cancel") {
    await cancelPurchase(user.id, parsed.data.purchaseId);
    return Response.json({ ok: true, balance: await creditBalance(user.id) });
  }
  const paid = await completePurchase(user.id, parsed.data.purchaseId, "test");
  if (!paid) return Response.json({ error: "That purchase was already completed or canceled." }, { status: 409 });
  return Response.json({ ok: true, balance: await creditBalance(user.id) });
}
