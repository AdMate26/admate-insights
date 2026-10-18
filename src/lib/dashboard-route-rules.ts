/**
 * Serves the AdMate dashboard (dashboard/, a separate Next.js deployment with
 * basePath "/app") at /app on this site, via Nitro route rules. On Vercel these
 * become edge rewrites ahead of this app's server function; elsewhere Nitro
 * proxies them.
 *
 * Off unless ADMATE_DASHBOARD_ORIGIN is set at build time, so builds without it
 * are exactly as before. The value must be a bare http(s) origin.
 *
 * With a Vercel "Protection Bypass for Automation" secret (the dashboard
 * deployment kept behind Vercel Authentication), the proxy adds it as the
 * x-vercel-protection-bypass request header. Nitro then proxies from this
 * site's server function instead of a Vercel edge rewrite (a rewrite cannot set
 * request headers), so the secret stays server-side: it is never in a URL, the
 * browser bundle or .vercel/output/config.json.
 */
export const BYPASS_HEADER = "x-vercel-protection-bypass";

type DashboardProxy = string | { to: string; headers: Record<string, string> };

export function dashboardRouteRules(
  origin: string | undefined,
  bypassSecret?: string,
): Record<string, { proxy: DashboardProxy }> | undefined {
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
  const secret = bypassSecret?.trim();
  if (secret && !/^[A-Za-z0-9_-]{16,}$/.test(secret)) {
    throw new Error("ADMATE_DASHBOARD_BYPASS_SECRET must be a Vercel bypass secret.");
  }
  const to = (target: string): DashboardProxy =>
    secret ? { to: target, headers: { [BYPASS_HEADER]: secret } } : target;
  return {
    "/app": { proxy: to(`${url.origin}/app`) },
    "/app/**": { proxy: to(`${url.origin}/app/**`) },
  };
}
