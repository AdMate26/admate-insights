import { describe, expect, it } from "vitest";
import { appEnv } from "@/lib/analytics";
import { sanitizeEvent } from "@/lib/analytics-sanitize";

// The privacy filter is tested in full on the website (src/lib/analytics/
// sanitize.test.ts), which also checks this copy is identical. These cases
// cover what only the dashboard sends.
const opts = { ownHost: "www.admate.site" };

describe("dashboard analytics", () => {
  it("account IDs in /app paths and query strings never reach PostHog", () => {
    const out = sanitizeEvent(
      {
        event: "$pageview",
        properties: {
          $current_url: "https://www.admate.site/app/c/13eb5ae5-76a5-4d4e-a5d7-d7b2232eb70b/actions?open=detector:x&from=2026-10-01",
          $pathname: "/app/c/13eb5ae5-76a5-4d4e-a5d7-d7b2232eb70b/actions",
        },
      },
      opts,
    );
    expect(out?.properties.$current_url).toBe("https://www.admate.site/app/c/:id/actions");
    expect(out?.properties.$pathname).toBe("/app/c/:id/actions");
  });

  it("upload failures carry a reason code, never the error message or file name", () => {
    const out = sanitizeEvent(
      { event: "report_upload_failed", properties: { stage: "saving", reason: "http_422", error: "No rows in Q3 Lotus.csv", file_name: "Q3.csv" } },
      opts,
    );
    expect(out?.properties).toEqual({ stage: "saving", reason: "http_422" });
  });

  it("recommendation and analysis events keep only codes", () => {
    const rec = sanitizeEvent(
      { event: "recommendation_viewed", properties: { account: "own", view: "advanced", detector: "cpa_spike", kind: "issue", title: "Lotus Serum CPA up 40%" } },
      opts,
    );
    expect(rec?.properties).toEqual({ account: "own", view: "advanced", detector: "cpa_spike", kind: "issue" });
    expect(sanitizeEvent({ event: "analysis_viewed", properties: { account: "Lotus Skincare (sample)", view: "beginner" } }, opts)?.properties).toEqual({ view: "beginner" });
  });

  it("labels test traffic by where it runs", () => {
    expect(appEnv("www.admate.site")).toBe("production");
    expect(appEnv("localhost")).toBe("local");
    expect(appEnv("admate-insights-git-x-ad-mate.vercel.app")).toBe("preview");
    expect(appEnv("admate-web-1.asia-southeast1.run.app")).toBe("cloudrun");
  });
});
