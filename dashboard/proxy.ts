import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/cookie";
import { websiteUrl } from "./lib/integration/paths";

// Quick first gate: without a session cookie, pages redirect to sign-in and the
// API answers 401. It only checks that the cookie exists; every page, action and
// API route still checks the session and account ownership against the database.
//
// AdMate integration: sign-in lives on the website (Supabase email OTP). Signed-out
// visitors go to its /home, which re-checks the sign-in and comes back here. The
// only public endpoints are the session bridge (app/api/session) and the
// secret-protected public demo refresh (app/api/internal/public-demo).
const PUBLIC = ["/api/session", "/api/internal/public-demo"];

// Public demo (lib/integration/public-demo.ts): READ requests to these paths are
// marked so that, without a valid session, they get the read-only visitor
// identity (which can only see the shared demo account). Any copy of the mark
// sent by the browser is always removed first. The dashboard root (/app) is not
// included: signed-out visitors there still go to sign-in.
const VISITOR_HEADER = "x-admate-public-demo";
const VISITOR_PAGES = /^\/(demo|c\/[^/]+(\/(actions|campaigns|audience|reports|settings|upload|alerts|recommendations|compare|data))?)$/;
const VISITOR_API = ["/api/counts"];

export function proxy(request: NextRequest) {
  const { pathname, search, basePath } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete(VISITOR_HEADER);
  const read = (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
  const visitorRead = read && (VISITOR_PAGES.test(pathname) || VISITOR_API.includes(pathname));
  if (visitorRead) headers.set(VISITOR_HEADER, "1");
  const pass = () => NextResponse.next({ request: { headers } });

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return pass();
  if (request.cookies.has(SESSION_COOKIE) || visitorRead) return pass();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(websiteUrl("/home"), request.url);
  if (pathname !== "/") url.searchParams.set("next", basePath + pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next's own files, the analytics relay (/ingest) and anything with a file extension.
  matcher: ["/((?!_next/static|_next/image|ingest|.*\\..*).*)"],
};
