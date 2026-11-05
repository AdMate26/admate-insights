// A fixed route in the dashboard, backed exclusively by an isolated sample database.
export const PUBLIC_DEMO_WORKSPACE = "00000000-0000-4000-8000-00000000de00";
export const PUBLIC_DEMO_OWNER = "public-demo";
export const PUBLIC_DEMO_HEADER = "x-admate-public-demo";

const DEMO_APIS = new Set(["/api/counts", "/api/v5/detail", "/api/v5/daily"]);

export function isPublicDemoRoute(pathname: string, search: URLSearchParams): boolean {
  const account = `/c/${PUBLIC_DEMO_WORKSPACE}`;
  return pathname === "/demo" || pathname === account || pathname.startsWith(account + "/") ||
    (DEMO_APIS.has(pathname) && search.get("ws") === PUBLIC_DEMO_WORKSPACE);
}
