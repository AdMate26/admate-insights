import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { appEnv, signInMethod } from "./posthog";
import { cleanPath, cleanUrl, sanitizeEvent, type AnalyticsEvent } from "./sanitize";

const website = {
  ownHost: "www.admate.site",
  skipPageviewPrefixes: ["/app", "/auth/callback", "/home", "/logout"],
};
const pageview = (props: Record<string, unknown>): AnalyticsEvent => ({
  event: "$pageview",
  properties: props,
});

test("the website and dashboard use the same privacy filter", () => {
  const read = (path: string) =>
    readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const here = read("./sanitize.ts");
  const dashboard = read("../../../dashboard/lib/analytics-sanitize.ts");
  expect(dashboard).toBe(here);
});

test("URLs lose query strings, fragments and IDs; other sites keep only their origin", () => {
  expect(cleanPath("/reset-password?token=abc#access_token=xyz")).toBe("/reset-password");
  expect(cleanPath("/app/c/13eb5ae5-76a5-4d4e-a5d7-d7b2232eb70b/actions")).toBe(
    "/app/c/:id/actions",
  );
  expect(cleanPath("/campaigns/1792869003788")).toBe("/campaigns/:id");
  expect(
    cleanUrl("https://www.admate.site/auth/callback?code=secret-code", "www.admate.site"),
  ).toBe("https://www.admate.site/auth/callback");
  expect(
    cleanUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=1&state=x", "www.admate.site"),
  ).toBe("https://accounts.google.com");
  expect(cleanUrl("javascript:alert(1)", "www.admate.site")).toBeNull();
});

test("page views: URL properties are cleaned, page content and emails dropped", () => {
  const out = sanitizeEvent(
    pageview({
      $current_url: "https://www.admate.site/privacy?email=a@b.co#x",
      $pathname: "/privacy",
      $referrer: "https://mail.example.com/inbox/123?id=9",
      $initial_referrer: "$direct",
      $title: "Lotus Skincare",
      $elements_chain: "div:text=secret",
      $browser: "Chrome",
      $session_id: "0192",
      $search_engine_query: "me@example.com",
      app: "website",
      app_env: "production",
      email: "me@example.com",
      utm_source: "newsletter",
      utm_campaign: "spring sale for me@example.com",
    }),
    website,
  );
  expect(out?.properties).toEqual({
    $current_url: "https://www.admate.site/privacy",
    $pathname: "/privacy",
    $referrer: "https://mail.example.com",
    $initial_referrer: "$direct",
    $browser: "Chrome",
    $session_id: "0192",
    app: "website",
    app_env: "production",
    utm_source: "newsletter",
  });
});

test("no duplicate page views: the website drops /app pages and hand-off pages", () => {
  expect(sanitizeEvent(pageview({ $pathname: "/app/c/abc" }), website)).toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/app" }), website)).toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/auth/callback" }), website)).toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/home" }), website)).toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/apple" }), website)).not.toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/" }), website)).not.toBeNull();
});

test("a repeat page view of the same page is dropped; a new page is not", () => {
  const lastPageview = { path: null as string | null };
  const opts = { ...website, lastPageview };
  expect(sanitizeEvent(pageview({ $pathname: "/onboarding" }), opts)).not.toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/onboarding?access=pending" }), opts)).toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/privacy" }), opts)).not.toBeNull();
  expect(sanitizeEvent(pageview({ $pathname: "/onboarding" }), opts)).not.toBeNull();
  expect(
    sanitizeEvent({ event: "login_completed", properties: { method: "google" } }, opts),
  ).not.toBeNull();
});

test("only listed events are sent, with listed short-code properties only", () => {
  for (const event of [
    "$autocapture",
    "$rageclick",
    "$exception",
    "$snapshot",
    "survey sent",
    "anything",
  ]) {
    expect(sanitizeEvent({ event, properties: {} }, website)).toBeNull();
  }
  const login = sanitizeEvent(
    {
      event: "login_completed",
      properties: { method: "email_code", email: "me@example.com", token: "phc_x" },
    },
    website,
  );
  expect(login?.properties).toEqual({ method: "email_code", token: "phc_x" });
  // Free text is never a code, even under an allowed name.
  const failed = sanitizeEvent(
    {
      event: "report_upload_failed",
      properties: { stage: "saving", reason: "Q3 report.csv has no rows", size_kb: 12 },
    },
    website,
  );
  expect(failed?.properties).toEqual({ stage: "saving", size_kb: 12 });
  expect(sanitizeEvent(null, website)).toBeNull();
});

test("person properties never carry an email or name", () => {
  const out = sanitizeEvent(
    {
      event: "$identify",
      properties: { $anon_distinct_id: "anon-1" },
      $set: { email: "me@example.com", name: "Me", $browser: "Safari" },
      $set_once: {
        $initial_current_url: "https://www.admate.site/login?next=/app/c/x",
        $initial_email: "a@b.co",
      },
    },
    website,
  );
  expect(out?.$set).toEqual({ $browser: "Safari" });
  expect(out?.$set_once).toEqual({ $initial_current_url: "https://www.admate.site/login" });
});

test("test traffic is labelled and sign-in methods are codes", () => {
  expect(appEnv("www.admate.site")).toBe("production");
  expect(appEnv("localhost")).toBe("local");
  expect(appEnv("admate-insights-git-analytics-ad-mate.vercel.app")).toBe("preview");
  expect(appEnv("admate-web-356411914520.asia-southeast1.run.app")).toBe("cloudrun");
  expect(signInMethod("google")).toBe("google");
  expect(signInMethod("email")).toBe("email_code");
  expect(signInMethod(undefined)).toBe("email_code");
});
