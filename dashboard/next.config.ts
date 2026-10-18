import type { NextConfig } from "next";

// PostHog region: US by default, or https://eu.i.posthog.com.
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const posthogAssets = posthogHost.replace(/^https:\/\/(\w+)\.i\./, "https://$1-assets.i.");

const nextConfig: NextConfig = {
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
};

export default nextConfig;
