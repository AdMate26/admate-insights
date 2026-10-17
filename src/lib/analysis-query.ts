import { queryOptions, type QueryClient } from "@tanstack/react-query";

import {
  getAdMateAnalysis,
  getAllAnalyses,
  getWorkspaceAccess,
  type AdMateAnalysis,
} from "./admate.functions";
import { DEFAULT_BRAND, type LiveBrand, type WorkspaceBrand } from "./brands";
import { DEFAULT_PLATFORM, type Platform } from "./platforms";

/** One (brand, platform) objective-aware analysis. */
export function analysisQueryOptions(
  brand: WorkspaceBrand = DEFAULT_BRAND,
  platform: Platform = DEFAULT_PLATFORM,
) {
  return queryOptions<AdMateAnalysis>({
    queryKey: ["admate", "analysis", brand, platform],
    queryFn: () => getAdMateAnalysis({ data: { brand, platform } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * All of one brand's connected platforms at once — Overview, the shell scope bar
 * and Alerts read this.
 */
export function allAnalysisQueryOptions(brand: WorkspaceBrand = DEFAULT_BRAND) {
  return queryOptions<AdMateAnalysis[]>({
    queryKey: ["admate", "analysis", "all", brand],
    queryFn: () => getAllAnalyses({ data: { brand } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Live brands the signed-in user may open (only the verified owner gets any).
 * Keyed by user id so a different sign-in never reuses another user's answer.
 */
export function workspaceAccessQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["admate", "workspace-access", userId],
    queryFn: () => getWorkspaceAccess(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The server-verified live brands for the current session. A failed check
 * (network, server error) grants nothing — routing fails closed — and is not
 * cached as an answer.
 */
export async function fetchWorkspaceAccess(
  queryClient: QueryClient,
  userId: string,
): Promise<{ liveBrands: LiveBrand[] }> {
  try {
    return await queryClient.ensureQueryData(workspaceAccessQueryOptions(userId));
  } catch {
    return { liveBrands: [] };
  }
}
