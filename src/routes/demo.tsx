import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DashboardScreen } from "@/components/admate/DashboardScreen";
import { allAnalysisQueryOptions } from "@/lib/analysis-query";
import { validateDashboardSearch } from "@/lib/dashboard-search";

/**
 * /demo — the public "Try AdMate" dashboard on synthetic demo data. No login is
 * required and there is intentionally no auth guard here.
 */
export const Route = createFileRoute("/demo")({
  validateSearch: validateDashboardSearch,
  loaderDeps: ({ search }) => ({ brand: search.brand }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(allAnalysisQueryOptions(deps.brand)),
  head: () => ({
    meta: [
      { title: "Try AdMate — Demo" },
      {
        name: "description",
        content:
          "Explore AdMate on synthetic demo data: every campaign judged on the metric its objective was bought against.",
      },
    ],
  }),
  component: DemoDashboard,
});

function DemoDashboard() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <DashboardScreen
      mode="demo"
      search={search}
      onNavigate={(next) => navigate({ to: "/demo", search: next })}
    />
  );
}
