import { queryOptions } from "@tanstack/react-query";

import { getAdMateAnalysis, getAllAnalyses, type AdMateAnalysis } from "./admate.functions";
import { DEFAULT_PLATFORM, type Platform } from "./platforms";

/** One platform's objective-aware analysis. */
export function analysisQueryOptions(platform: Platform = DEFAULT_PLATFORM) {
  return queryOptions<AdMateAnalysis>({
    queryKey: ["admate", "analysis", platform],
    queryFn: () => getAdMateAnalysis({ data: { platform } }),
    staleTime: 5 * 60 * 1000,
  });
}

/** All platforms at once — Overview, the shell scope bar and Alerts read this. */
export function allAnalysisQueryOptions() {
  return queryOptions<AdMateAnalysis[]>({
    queryKey: ["admate", "analysis", "all"],
    queryFn: () => getAllAnalyses(),
    staleTime: 5 * 60 * 1000,
  });
}
