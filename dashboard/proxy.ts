import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/cookie";

// Quick first gate: without a session cookie, pages redirect to sign-in and the
// API answers 401. It only checks that the cookie exists; every page, action and
// API route still checks the session and account ownership against the database.
const PUBLIC = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next's own files, the analytics relay (/ingest) and anything with a file extension.
  matcher: ["/((?!_next/static|_next/image|ingest|.*\\..*).*)"],
};
