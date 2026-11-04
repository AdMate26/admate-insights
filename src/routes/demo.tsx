import { createFileRoute, redirect, type SearchSchemaInput } from "@tanstack/react-router";
import type { DashboardSearch } from "@/lib/dashboard-search";

// Ignore old bookmarked query parameters. The route only redirects into sign-in.
export const Route = createFileRoute("/demo")({
  validateSearch: (search: Partial<DashboardSearch> & SearchSchemaInput) => search,
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
