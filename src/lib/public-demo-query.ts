import { queryOptions } from "@tanstack/react-query";

import type { AdMateAnalysis } from "./admate.functions";
import { brandMeta, DEFAULT_BRAND, isBrand, type WorkspaceBrand } from "./brands";
import { platformMeta } from "./platforms";

/** This query only reads bundled fixtures, even when a private brand is requested. */
export function publicDemoQueryOptions(requestedBrand: WorkspaceBrand) {
  const brand = isBrand(requestedBrand) ? requestedBrand : DEFAULT_BRAND;
  const { label, platforms } = brandMeta(brand);
  return queryOptions<AdMateAnalysis[]>({
    queryKey: ["admate", "public-demo", brand],
    queryFn: async () => {
      const [{ getDemoCampaignsForBrand }, { analyzeCampaigns }] = await Promise.all([
        import("./analysis/demo"),
        import("./analysis/engine"),
      ]);
      return platforms.map((platform) => {
        const { label: platformLabel, modeLabel } = platformMeta(platform);
        return {
          ...analyzeCampaigns(getDemoCampaignsForBrand(brand, platform)),
          brand,
          brandLabel: label,
          platform,
          provider: `${brand}-${platform}-demo`,
          providerLabel: `${label} · ${platformLabel} (synthetic demo)`,
          modeLabel,
          source: "demo",
          live: null,
          aiStatus: "disabled",
          aiError: null,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
