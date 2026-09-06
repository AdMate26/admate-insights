import { queryOptions } from "@tanstack/react-query";

import { getAdMateAnalysis, getAllAnalyses, type AdMateAnalysis } from "./admate.functions";
import { DEFAULT_BRAND, type Brand } from "./brands";
import { DEFAULT_PLATFORM, type Platform } from "./platforms";

/** One (brand, platform) objective-aware analysis. */
export function analysisQueryOptions(
  brand: Brand = DEFAULT_BRAND,
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
export function allAnalysisQueryOptions(brand: Brand = DEFAULT_BRAND) {
  return queryOptions<AdMateAnalysis[]>({
    queryKey: ["admate", "analysis", "all", brand],
    queryFn: () => getAllAnalyses({ data: { brand } }),
    staleTime: 5 * 60 * 1000,
  });
}
