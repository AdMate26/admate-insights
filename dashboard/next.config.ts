import type { NextConfig } from "next";
import { BASE_PATH, serverActionOrigins } from "./lib/integration/paths";

// PostHog region: US by default, or https://eu.i.posthog.com.
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const posthogAssets = posthogHost.replace(/^https:\/\/(\w+)\.i\./, "https://$1-assets.i.");

const nextConfig: NextConfig = {
  // AdMate integration: served at www.admate.site/app (INTEGRATION.md).
  basePath: BASE_PATH,
  // PGlite ships a WASM Postgres + data files it loads from its own package
  // directory, so it must be required natively instead of bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // A second dev server (e.g. for reviewing changes) needs its own build folder.
  ...(process.env.ADMATE_DIST_DIR ? { distDir: process.env.ADMATE_DIST_DIR } : {}),
  // Analytics relay: the browser sends events to /ingest on AdMate's own domain.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
      { source: "/ingest/array/:path*", destination: `${posthogAssets}/array/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  // PostHog's API paths end in a slash; don't redirect them.
  skipTrailingSlashRedirect: true,
  // AdMate integration: Server Actions arrive through the website's /app
  // rewrite, so the browser's Origin is the public host (ADMATE_PUBLIC_ORIGIN).
  // Allow exactly that host; Next.js keeps refusing every other origin.
  experimental: { serverActions: { allowedOrigins: serverActionOrigins() } },
};

export default nextConfig;
