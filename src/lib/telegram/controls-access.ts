import type { LiveBrand } from "../brands";

/**
 * Whether the dashboard may OFFER Telegram controls (Preview, Send Now,
 * "Send briefing now", schedules). True only in the signed-in workspace once
 * the server has granted this session the owner's live brand — the same
 * server answer (getWorkspaceAccess → verifyOwnerAccess) that unlocks My
 * Account. The public demo never asks, so it is always false there.
 *
 * Display only: every Telegram server function re-checks the owner itself.
 */
export function canOfferTelegramControls(
  mode: "demo" | "workspace",
  serverLiveBrands: readonly LiveBrand[] | undefined,
): boolean {
  return mode === "workspace" && Boolean(serverLiveBrands?.includes("my_account"));
}
