import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/cookie";
import { websiteUrl } from "./lib/integration/paths";
import { isPublicDemoRoute, PUBLIC_DEMO_HEADER } from "./lib/integration/public-demo";

// Fast cookie-presence gate. Pages, actions and APIs still validate the session
// and account ownership against the database. Bridge and cron check their own credentials.
const PUBLIC = ["/api/session", "/api/cron"];

export function proxy(request: NextRequest) {
  const { pathname, search, basePath } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PUBLIC_DEMO_HEADER);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  if (isPublicDemoRoute(pathname, request.nextUrl.searchParams)) {
    if (!["GET", "HEAD"].includes(request.method) || requestHeaders.has("next-action")) {
      return NextResponse.json({ error: "The public demo is read-only." }, { status: 405 });
    }
    requestHeaders.set(PUBLIC_DEMO_HEADER, "1");
    requestHeaders.delete("cookie");
    const response = next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return next();
  if (request.cookies.has(SESSION_COOKIE)) return next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(websiteUrl("/home"), request.url);
  if (pathname !== "/") url.searchParams.set("next", basePath + pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next's own files, the analytics relay (/ingest) and anything with a file extension.
  matcher: ["/((?!_next/static|_next/image|ingest|.*\\..*).*)"],
};
