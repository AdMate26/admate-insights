import { queryOptions } from "@tanstack/react-query";

import { getAdMateAnalysis, type AdMateAnalysis } from "./admate.functions";
import { DEFAULT_PLATFORM, type Platform } from "./platforms";

/**
 * Per-platform analysis query. The platform is part of the query key so each
 * platform's demo data + findings are cached independently and never mixed.
 */
export function analysisQueryOptions(platform: Platform = DEFAULT_PLATFORM) {
  return queryOptions<AdMateAnalysis>({
    queryKey: ["admate", "analysis", platform],
    queryFn: () => getAdMateAnalysis({ data: { platform } }),
    staleTime: 5 * 60 * 1000,
  });
}
