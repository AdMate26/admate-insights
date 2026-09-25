import type { SearchSchemaInput } from "@tanstack/react-router";

import type { ViewKey } from "@/components/admate/AppShell";
import { DEFAULT_BRAND, isBrand, resolveBrandPlatform, type Brand } from "@/lib/brands";
import type { Platform } from "@/lib/platforms";

const VIEWS: ViewKey[] = ["overview", "campaigns", "alerts", "briefings", "reports"];

function isView(v: unknown): v is ViewKey {
  return typeof v === "string" && (VIEWS as string[]).includes(v);
}

export type DashboardSearch = {
  view: ViewKey;
  brand: Brand;
  platform: Platform;
  objective?: string;
};

/**
 * Search schema shared by the public demo (/demo) and the workspace (/home).
 * Every param is optional on the way in (links may pass none or a subset) and
 * always resolved on the way out. Values come from the URL, so each one is
 * still checked at runtime.
 */
export function validateDashboardSearch(
  search: Partial<DashboardSearch> & SearchSchemaInput,
): DashboardSearch {
  const brand = isBrand(search.brand) ? search.brand : DEFAULT_BRAND;
  return {
    // Default landing view is Campaigns for the default/first brand; an
    // explicit ?view=overview (e.g. the "All accounts" nav) still resolves
    // through here, so refresh and direct URLs keep whatever view is set.
    view: isView(search.view) ? search.view : "campaigns",
    brand,
    // Platform is always clamped to one the selected brand has connected.
    platform: resolveBrandPlatform(brand, search.platform),
    ...(typeof search.objective === "string" ? { objective: search.objective } : {}),
  };
}
