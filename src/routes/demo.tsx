import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DashboardScreen } from "@/components/admate/DashboardScreen";
import { publicDemoQueryOptions } from "@/lib/public-demo-query";
import { validateDashboardSearch } from "@/lib/dashboard-search";

export const Route = createFileRoute("/demo")({
  validateSearch: validateDashboardSearch,
  loaderDeps: ({ search }) => ({ brand: search.brand }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(publicDemoQueryOptions(deps.brand)),
  head: () => ({
    meta: [
      { title: "AdMate — Demo" },
      { name: "description", content: "Explore AdMate with synthetic campaign data." },
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
      onNavigate={(next) => void navigate({ to: "/demo", search: next })}
    />
  );
}
