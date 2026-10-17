import type { SearchSchemaInput } from "@tanstack/react-router";

import type { ViewKey } from "@/components/admate/AppShell";
import {
  DEFAULT_BRAND,
  isBrand,
  isWorkspaceBrand,
  resolveBrandPlatform,
  type WorkspaceBrand,
} from "@/lib/brands";
import type { Platform } from "@/lib/platforms";

const VIEWS: ViewKey[] = ["overview", "campaigns", "alerts", "briefings", "reports"];

function isView(v: unknown): v is ViewKey {
  return typeof v === "string" && (VIEWS as string[]).includes(v);
}

export type DashboardSearch = {
  view: ViewKey;
  brand: WorkspaceBrand;
  platform: Platform;
  objective?: string;
};

type SearchInput = Partial<DashboardSearch> & SearchSchemaInput;

function resolveSearch(search: SearchInput, brand: WorkspaceBrand): DashboardSearch {
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

/**
 * Search schema for the public demo (/demo): only the synthetic demo brands
 * are accepted, so a live brand can never be selected there. Every param is
 * optional on the way in and always resolved on the way out; values come from
 * the URL, so each one is still checked at runtime.
 */
export function validateDashboardSearch(search: SearchInput): DashboardSearch {
  return resolveSearch(search, isBrand(search.brand) ? search.brand : DEFAULT_BRAND);
}

/**
 * Search schema for the signed-in workspace (/home): demo brands plus live
 * brands. Whether the user may actually open a live brand is decided on the
 * server (owner check) and by the route guard.
 */
export function validateWorkspaceSearch(search: SearchInput): DashboardSearch {
  return resolveSearch(search, isWorkspaceBrand(search.brand) ? search.brand : DEFAULT_BRAND);
}
