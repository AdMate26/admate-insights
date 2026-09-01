import { queryOptions } from "@tanstack/react-query";

import { getAdMateAnalysis, type AdMateAnalysis } from "./admate.functions";

export const analysisQueryOptions = queryOptions<AdMateAnalysis>({
  queryKey: ["admate", "analysis"],
  queryFn: () => getAdMateAnalysis(),
  staleTime: 5 * 60 * 1000,
});
