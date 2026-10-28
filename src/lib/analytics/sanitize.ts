/**
 * Privacy filter for every product-analytics (PostHog) event, applied in the
 * SDK's `before_send` hook before anything leaves the browser.
 *
 * Kept identical in src/lib/analytics/sanitize.ts (website) and
 * dashboard/lib/analytics-sanitize.ts (the two apps are built separately);
 * src/lib/analytics/sanitize.test.ts checks they match.
 *
 * - Only the events listed in EVENT_PROPS are sent; anything else (autocapture,
 *   replays, exceptions, surveys, …) is dropped even if it were switched on.
 * - Our own properties must be listed for that event and be a number, a boolean
 *   or a short code (letters, digits, `_ . : -`), never free text.
 * - PostHog's own `$` properties are kept, except ones that can carry page
 *   content or personal data. Every URL loses its query string and `#…` part,
 *   IDs in paths become `:id`, and URLs of other sites keep only their origin.
 * - Person properties (`$set`, `$set_once`) keep only PostHog's own `$` keys,
 *   so no email or name can be attached to a person.
 */

type Properties = Record<string, unknown>;

/** Minimal shape of a PostHog capture result (posthog-js `CaptureResult`). */
export interface AnalyticsEvent {
  event: string;
  properties: Properties;
  $set?: Properties;
  $set_once?: Properties;
  [key: string]: unknown;
}

export interface SanitizeOptions {
  /** Hostname of the page sending the event (`window.location.hostname`). */
  ownHost: string;
  /** Page views for these path prefixes are dropped (another app owns them). */
  skipPageviewPrefixes?: readonly string[];
  /**
   * The last page view's cleaned path, kept by the caller for this page load.
   * A page view of the same path straight after it is dropped (pages that
   * rewrite their own address, e.g. adding `?access=…`, are one visit).
   */
  lastPageview?: { path: string | null };
}

/** Allowed events and, for each, the only custom properties it may carry. */
export const EVENT_PROPS: Readonly<Record<string, readonly string[]>> = {
  $pageview: [],
  $identify: [],
  login_completed: ["method"],
  signup_completed: ["method"],
  report_upload_started: ["file_type", "size_kb", "new_account"],
  report_previewed: ["platform", "level", "granularity", "rows"],
  report_uploaded: ["platform", "level", "granularity", "breakdown", "rows", "days", "new_account"],
  report_upload_failed: ["stage", "reason", "size_kb"],
  report_undone: [],
  analysis_viewed: ["account", "view"],
  recommendation_viewed: ["account", "view", "detector", "kind"],
  telegram_connected: [],
};

/** Custom properties every event may carry (registered once at start-up). */
const GLOBAL_PROPS = new Set(["app", "app_env", "utm_source", "utm_medium", "utm_campaign"]);

/** PostHog properties that can contain page content or personal data. */
const BLOCKED_SYSTEM_PROPS = new Set([
  "$elements",
  "$elements_chain",
  "$el_text",
  "$title",
  "$ip",
  "$console_log",
  "$exception_list",
]);

const CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{5,}|[A-Za-z0-9_-]{24,})$/i;
const URL_KEY = /url|referrer|pathname/i;

/** A path with IDs replaced by `:id` and no query string or fragment. */
export function cleanPath(path: string): string {
  const bare = path.split(/[?#]/)[0] || "/";
  return bare
    .split("/")
    .map((segment) => (ID_SEGMENT.test(segment) ? ":id" : segment))
    .join("/");
}

/**
 * A URL safe to send: same-site URLs keep origin + cleaned path; other sites
 * keep only their origin. Non-http(s) or unparseable values become null.
 */
export function cleanUrl(value: string, ownHost: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== ownHost) return url.origin;
  return url.origin + cleanPath(url.pathname);
}

function cleanSystemValue(key: string, value: unknown, ownHost: string): unknown {
  if (typeof value !== "string" || !URL_KEY.test(key)) return value;
  if (value.startsWith("$")) return value; // e.g. "$direct"
  if (value.startsWith("/")) return cleanPath(value);
  return cleanUrl(value, ownHost);
}

function cleanSystemProps(props: Properties | undefined, ownHost: string): Properties {
  const out: Properties = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!key.startsWith("$") || BLOCKED_SYSTEM_PROPS.has(key)) continue;
    const cleaned = cleanSystemValue(key, value, ownHost);
    if (cleaned === null || cleaned === undefined) continue;
    if (typeof cleaned === "string" && cleaned.includes("@")) continue; // never an email
    out[key] = cleaned;
  }
  return out;
}

function allowedValue(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && CODE.test(value);
}

/** Returns the event to send, or null to drop it. Never throws. */
export function sanitizeEvent(
  event: AnalyticsEvent | null,
  options: SanitizeOptions,
): AnalyticsEvent | null {
  try {
    if (!event || typeof event.event !== "string") return null;
    const allowed = EVENT_PROPS[event.event];
    if (!allowed) return null;

    const props = event.properties ?? {};
    if (event.event === "$pageview") {
      const path = cleanPath(String(props["$pathname"] ?? ""));
      const owned = options.skipPageviewPrefixes ?? [];
      if (owned.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;
    }

    const properties = cleanSystemProps(props, options.ownHost);
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("$")) continue;
      if (key === "token" || key === "distinct_id") properties[key] = value;
      else if ((GLOBAL_PROPS.has(key) || allowed.includes(key)) && allowedValue(value)) {
        properties[key] = value;
      }
    }

    if (event.event === "$pageview" && options.lastPageview) {
      const path = String(properties["$pathname"] ?? "");
      if (path === options.lastPageview.path) return null;
      options.lastPageview.path = path;
    }

    const result: AnalyticsEvent = { ...event, properties };
    if (event.$set) result.$set = cleanSystemProps(event.$set, options.ownHost);
    if (event.$set_once) result.$set_once = cleanSystemProps(event.$set_once, options.ownHost);
    return result;
  } catch {
    return null;
  }
}
