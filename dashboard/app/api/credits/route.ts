import { requireUser } from "@/lib/auth/session";
import { BUY_AVAILABLE, creditBalance, creditHistory, PACKS, TEST_PAYMENTS } from "@/lib/ai/credits";

// The signed-in person's AdMate Assistant credits: balance, packs on sale and recent history.
export async function GET() {
  const user = await requireUser();
  const [balance, history] = await Promise.all([creditBalance(user.id), creditHistory(user.id)]);
  return Response.json({ balance, canBuy: BUY_AVAILABLE, packs: BUY_AVAILABLE ? PACKS : [], testPayments: TEST_PAYMENTS, history }, { headers: { "cache-control": "no-store" } });
}
