// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import { dashboardRouteRules } from "./src/lib/dashboard-route-rules";
import { assertProductionBuild } from "./src/lib/production-guard";

// Vercel Production builds only: must come from main and serve the dashboard.
assertProductionBuild(process.env);

// The AdMate dashboard (dashboard/, Next.js) is served at /app only when
// ADMATE_DASHBOARD_ORIGIN is set at build time; otherwise nothing changes.
const routeRules = dashboardRouteRules(process.env["ADMATE_DASHBOARD_ORIGIN"]);
// The config's `nitro` type only lists preset/output/cloudflare, but the whole
// object is passed to Nitro, whose routeRules this uses (checked in a Vercel-
// preset build: they become edge rewrites in .vercel/output/config.json).
type NitroOption = NonNullable<NonNullable<Parameters<typeof defineConfig>[0]>["nitro"]>;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(routeRules ? { nitro: { routeRules } as unknown as NitroOption } : {}),
});
