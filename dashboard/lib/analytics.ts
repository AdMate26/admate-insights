import posthog from "posthog-js";
import { sanitizeEvent, type AnalyticsEvent } from "./analytics-sanitize";

// Product analytics (PostHog) — browser only, off until the person allows it.
//
// AdMate integration: the website and this dashboard (served at /app on the
// same site) share one PostHog project and one consent choice (CONSENT_KEY in
// localStorage), so people choose once. Accepting the Terms is not analytics
// consent. Page views, a few named events and the Supabase user ID only: no
// session replay, autocapture, heatmaps, surveys, flags or remote scripts, and
// every event passes the privacy filter in ./analytics-sanitize. Without
// NEXT_PUBLIC_POSTHOG_KEY nothing runs and no banner is shown.

export const CONSENT_KEY = "admate.analytics-consent";
export type Consent = "granted" | "denied";
const OPEN_SETTINGS_EVENT = "admate:analytics-settings";
const SUPABASE_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let started = false;
const lastPageview = { path: null as string | null };
const whenReady: Array<() => void> = [];

function settings(): { key: string; host: string } | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  if (!key || !/^phc_[A-Za-z0-9]{20,}$/.test(key)) return null;
  if (!/^https:\/\/[a-z0-9.-]+\.posthog\.com$/.test(host)) return null;
  return { key, host };
}

export function analyticsAvailable(): boolean {
  return settings() !== null;
}

// production | preview | cloudrun | local — lets test traffic be filtered out.
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

export function writeConsent(value: Consent) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked: the choice applies to this page only */
  }
  if (value === "granted") startAnalytics();
  else stopAnalytics();
}

export function openAnalyticsSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function onAnalyticsSettings(listener: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}

// Starts PostHog when allowed and configured. Safe to call repeatedly.
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
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      before_send: (event) => sanitizeEvent(event as unknown as AnalyticsEvent | null, { ownHost, lastPageview }) as unknown as typeof event,
    });
    // `$geoip_disable`: PostHog does not look up a city or coordinates from the IP.
    posthog.register({ app: "dashboard", app_env: appEnv(ownHost), $geoip_disable: true });
    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
  } catch {
    return false;
  }
  started = true;
  whenReady.splice(0).forEach((run) => run());
  return true;
}

// Stops sending and forgets this browser's analytics identity.
export function stopAnalytics() {
  if (started) {
    posthog.opt_out_capturing();
    posthog.reset();
  }
  rememberEmailSent(null);
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("ph_") || key.startsWith("__ph_")) window.localStorage.removeItem(key);
    }
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name && (name.startsWith("ph_") || name.startsWith("__ph_"))) document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  } catch {
    /* nothing stored */
  }
}

function capturing() {
  return started && !posthog.has_opted_out_capturing();
}

// Named product events (PostHog), e.g. report_uploaded. Does nothing when
// analytics is off. Only send counts and codes — never file contents or names,
// account names or anything the user typed (analytics-sanitize drops the rest).
export function track(event: string, props?: Record<string, string | number | boolean | null>) {
  if (!capturing()) return;
  const clean = props ? Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null)) : undefined;
  posthog.capture(event, clean);
}

// Remembers (as a short fingerprint, never the email itself) that this user's
// email is already on their PostHog person, so it isn't re-sent on every page.
const PERSON_KEY = "admate.analytics-person";
function personMark(userId: string, email: string): string {
  let h = 5381;
  for (const ch of email) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `${userId}:${h.toString(36)}`;
}
function emailAlreadySent(mark: string): boolean {
  try {
    return window.localStorage.getItem(PERSON_KEY) === mark;
  } catch {
    return false;
  }
}
function rememberEmailSent(mark: string | null): void {
  try {
    if (mark) window.localStorage.setItem(PERSON_KEY, mark);
    else window.localStorage.removeItem(PERSON_KEY);
  } catch {
    /* storage blocked: the email may be sent again next page */
  }
}

// Links this browser to the signed-in Supabase user: their user ID and email
// (the only personal detail sent; only after the person allowed analytics).
export function identifyUser(userId: string, email?: string | null) {
  if (!SUPABASE_USER_ID.test(userId)) return;
  const run = () => {
    if (!capturing()) return;
    const mark = email ? personMark(userId, email) : null;
    const person = email && mark && !emailAlreadySent(mark) ? { email } : undefined;
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId, person);
    else if (person) posthog.setPersonProperties(person);
    if (person) rememberEmailSent(mark);
  };
  if (started) run();
  else whenReady.push(run);
}

export function resetAnalytics() {
  whenReady.length = 0;
  rememberEmailSent(null);
  if (started) posthog.reset();
}
