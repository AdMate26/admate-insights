/**
 * Product analytics (PostHog) for the website — browser only, off until the
 * visitor allows it.
 *
 * - Nothing loads or is sent before the visitor clicks "Allow" in the analytics
 *   banner (AnalyticsConsent). The choice is stored under CONSENT_KEY; the
 *   dashboard at /app reads the same key (same site), so people choose once.
 *   Accepting the Terms at sign-up is not analytics consent.
 * - Page views, a few named product events and the Supabase user ID. No session
 *   replay, autocapture, heatmaps, surveys, feature flags or remote scripts.
 * - Every event passes the privacy filter in ./sanitize before it is sent.
 * - Without VITE_POSTHOG_KEY nothing runs and no banner is shown.
 */
import posthog from "posthog-js";

import { sanitizeEvent, type AnalyticsEvent } from "./sanitize";

export const CONSENT_KEY = "admate.analytics-consent";
export type Consent = "granted" | "denied";
const CONSENT_EVENT = "admate:analytics-consent";
const OPEN_SETTINGS_EVENT = "admate:analytics-settings";

/** The dashboard (served at /app) records its own page views. */
const DASHBOARD_PREFIXES = ["/app"];
/** Hand-off pages with no content of their own. */
const TRANSIENT_PATHS = ["/auth/callback", "/home", "/logout"];

const SUPABASE_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let started = false;
const whenReady: Array<() => void> = [];

function settings(): { key: string; host: string } | null {
  const key: unknown = import.meta.env["VITE_POSTHOG_KEY"];
  const host: unknown = import.meta.env["VITE_POSTHOG_HOST"] || "https://us.i.posthog.com";
  if (typeof key !== "string" || !/^phc_[A-Za-z0-9]{20,}$/.test(key.trim())) return null;
  if (typeof host !== "string" || !/^https:\/\/[a-z0-9.-]+\.posthog\.com$/.test(host.trim()))
    return null;
  return { key: key.trim(), host: host.trim() };
}

/** True when this build has a PostHog key (otherwise there is nothing to ask). */
export function analyticsAvailable(): boolean {
  return settings() !== null;
}

/** production | preview | cloudrun | local — lets test traffic be filtered out. */
export function appEnv(host: string): string {
  if (host === "www.admate.site" || host === "admate.site") return "production";
  if (host === "localhost" || host === "127.0.0.1") return "local";
  if (host.endsWith(".run.app")) return "cloudrun";
  return "preview";
}

export function readConsent(): Consent | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked: the choice applies to this page only */
  }
  if (value === "granted") startAnalytics();
  else stopAnalytics();
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Re-opens the analytics banner (footer "Analytics settings" link). */
export function openAnalyticsSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function onAnalyticsSettings(listener: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}

/** Starts PostHog when allowed and configured. Safe to call repeatedly. */
export function startAnalytics(): boolean {
  if (started) {
    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
    return true;
  }
  if (typeof window === "undefined" || readConsent() !== "granted") return false;
  const config = settings();
  if (!config) return false;
  const ownHost = window.location.hostname;
  try {
    posthog.init(config.key, {
      api_host: config.host,
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      before_send: (event) =>
        sanitizeEvent(event as unknown as AnalyticsEvent | null, {
          ownHost,
          skipPageviewPrefixes: [...DASHBOARD_PREFIXES, ...TRANSIENT_PATHS],
        }) as unknown as typeof event,
    });
    posthog.register({ app: "website", app_env: appEnv(ownHost) });
    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
  } catch {
    return false;
  }
  started = true;
  whenReady.splice(0).forEach((run) => run());
  return true;
}

/** Stops sending and forgets this browser's analytics identity. */
export function stopAnalytics(): void {
  if (started) {
    posthog.opt_out_capturing();
    posthog.reset();
  }
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("ph_") || key.startsWith("__ph_")) window.localStorage.removeItem(key);
    }
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name && (name.startsWith("ph_") || name.startsWith("__ph_"))) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  } catch {
    /* nothing stored */
  }
}

function capturing(): boolean {
  return started && !posthog.has_opted_out_capturing();
}

type EventProps = Record<string, string | number | boolean>;

/**
 * A named product event. Only codes, counts and flags (see sanitize.ts).
 * `beforeLeaving` sends at once (for events right before a full-page navigation).
 */
export function track(event: string, props?: EventProps, beforeLeaving = false): void {
  if (!capturing()) return;
  posthog.capture(
    event,
    props,
    beforeLeaving ? { send_instantly: true, transport: "sendBeacon" } : undefined,
  );
}

/** Links this browser to the signed-in Supabase user (ID only, no email). */
export function identifyUser(userId: string): void {
  if (!SUPABASE_USER_ID.test(userId)) return;
  const run = () => {
    if (capturing() && posthog.get_distinct_id() !== userId) posthog.identify(userId);
  };
  if (started) run();
  else whenReady.push(run);
}

/** Forget the signed-in user in this browser (sign-out). */
export function resetAnalytics(): void {
  whenReady.length = 0;
  if (started) posthog.reset();
}

/** Supabase sign-in provider → analytics method code. */
export function signInMethod(provider: unknown): string {
  return provider === "google" ? "google" : "email_code";
}
