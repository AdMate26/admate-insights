// Integration with the AdMate website (Project A). AdMate's dashboard is served
// at www.admate.site/app; the landing page, sign-in (/login), /home and /logout
// belong to the website. See INTEGRATION.md.

// Next.js basePath. Links, pages and assets get it automatically; raw fetch()
// calls to this app's API must add it themselves (apiPath).
export const BASE_PATH = "/app";

export function apiPath(path: string): string {
  return `${BASE_PATH}${path}`;
}

// The public origin the browser uses (https://www.admate.site, or a Preview /
// local URL). Requests arrive through a rewrite, so the incoming Host header is
// this app's own deployment host and must never be used to build URLs.
export function publicOrigin(): string | null {
  const raw = process.env.ADMATE_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Absolute URL of a page on the website (outside this app's basePath).
export function websiteUrl(path: string): string {
  const origin = publicOrigin();
  return origin ? `${origin}${path}` : path;
}

// Hosts allowed to invoke Server Actions besides this app's own host (Next.js
// serverActions.allowedOrigins). People reach the dashboard through the
// website's /app rewrite, so their browser's Origin is the public host while
// the request reports this deployment's host. Exactly the public host
// ("www.admate.site", or "localhost:3000" with its port), never a wildcard;
// every other origin is still refused by Next.js's CSRF check.
export function serverActionOrigins(): string[] {
  const origin = publicOrigin();
  return origin ? [new URL(origin).host] : [];
}
