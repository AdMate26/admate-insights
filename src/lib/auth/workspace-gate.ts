import { isLiveBrand, type LiveBrand, type WorkspaceBrand } from "../brands";

/**
 * Who may enter the signed-in workspace (/home), and with which brand.
 *
 * - Users who finished onboarding enter as before.
 * - The verified owner (the server returned at least one live brand for their
 *   session) also enters without a completed onboarding status: their setup —
 *   the read-only Meta connection — is configured on the server. Nothing is
 *   written to their profile, and no one else is affected.
 * - Everyone else without a completed onboarding goes to /onboarding.
 * - A live brand is only for a user the server granted it; anyone else lands
 *   on the default demo brand.
 *
 * `liveBrands` must come from the server (`getWorkspaceAccess`), never from the
 * client. This decides routing only — the server re-checks the owner on every
 * live-data request.
 */
export type WorkspaceGate = "allow" | "onboarding" | "default-brand";

export function decideWorkspaceGate(input: {
  onboardingComplete: boolean;
  liveBrands: readonly LiveBrand[];
  requestedBrand: WorkspaceBrand;
}): WorkspaceGate {
  const { onboardingComplete, liveBrands, requestedBrand } = input;
  if (!onboardingComplete && liveBrands.length === 0) return "onboarding";
  if (isLiveBrand(requestedBrand) && !liveBrands.includes(requestedBrand)) return "default-brand";
  return "allow";
}

/** The owner check is a server round trip; only make it when it can matter. */
export function needsWorkspaceAccessCheck(input: {
  onboardingComplete: boolean;
  requestedBrand: WorkspaceBrand;
}): boolean {
  return !input.onboardingComplete || isLiveBrand(input.requestedBrand);
}
