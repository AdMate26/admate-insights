import type { NextConfig } from "next";
import { BASE_PATH, serverActionOrigins } from "./lib/integration/paths";

const nextConfig: NextConfig = {
  // AdMate integration: served at www.admate.site/app (INTEGRATION.md).
  basePath: BASE_PATH,
  // PGlite ships a WASM Postgres + data files it loads from its own package
  // directory, so it must be required natively instead of bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // A second dev server (e.g. for reviewing changes) needs its own build folder.
  ...(process.env.ADMATE_DIST_DIR ? { distDir: process.env.ADMATE_DIST_DIR } : {}),
  // AdMate integration: no /ingest analytics relay. Behind the website's /app
  // proxy it was unreachable, and a relay would forward the session cookie to
  // PostHog. The browser sends events to the PostHog host directly (lib/analytics.ts).
  // AdMate integration: Server Actions arrive through the website's /app
  // rewrite, so the browser's Origin is the public host (ADMATE_PUBLIC_ORIGIN).
  // Allow exactly that host; Next.js keeps refusing every other origin.
  experimental: { serverActions: { allowedOrigins: serverActionOrigins() } },
};

export default nextConfig;
