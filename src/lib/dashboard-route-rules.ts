/**
 * Serves the AdMate dashboard (dashboard/, a separate Next.js deployment with
 * basePath "/app") at /app on this site, via Nitro route rules. On Vercel these
 * become edge rewrites ahead of this app's server function; elsewhere Nitro
 * proxies them.
 *
 * Off unless ADMATE_DASHBOARD_ORIGIN is set at build time, so builds without it
 * are exactly as before. The value must be a bare http(s) origin.
 */
export function dashboardRouteRules(
  origin: string | undefined,
): Record<string, { proxy: string }> | undefined {
  const raw = origin?.trim();
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ADMATE_DASHBOARD_ORIGIN must be an absolute http(s) origin.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("ADMATE_DASHBOARD_ORIGIN must be a bare http(s) origin (no path).");
  }
  return {
    "/app": { proxy: `${url.origin}/app` },
    "/app/**": { proxy: `${url.origin}/app/**` },
  };
}
