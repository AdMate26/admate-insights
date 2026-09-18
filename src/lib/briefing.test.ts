import { expect, test } from "bun:test";

import { buildBriefing, briefingPlainText, type BriefingInput } from "./briefing";
import { needsAttentionCount, isError, isInReview } from "./attention";
import { analyzeCampaigns } from "./analysis/engine";
import { getDemoCampaigns } from "./analysis/demo";

const meta = analyzeCampaigns(getDemoCampaigns("meta"));
const tiktok = analyzeCampaigns(getDemoCampaigns("tiktok"));
const google = analyzeCampaigns(getDemoCampaigns("google_search"));
const linkedin = analyzeCampaigns(getDemoCampaigns("linkedin"));

const inputs: BriefingInput[] = [
  { ...meta, platform: "meta" },
  { ...tiktok, platform: "tiktok" },
  { ...google, platform: "google_search" },
  { ...linkedin, platform: "linkedin" },
];
const all = [...meta.findings, ...tiktok.findings, ...google.findings, ...linkedin.findings];
const html = buildBriefing(inputs);
const text = briefingPlainText(inputs);

const lowByPlat = {
  "Meta Ads": needsAttentionCount(meta.findings),
  "TikTok Ads": needsAttentionCount(tiktok.findings),
  "Google Search": needsAttentionCount(google.findings),
  "LinkedIn Ads": needsAttentionCount(linkedin.findings),
} as const;
const totalLow = Object.values(lowByPlat).reduce((s, n) => s + n, 0);
const totalErrors = all.filter(isError).length;
const totalReview = all.filter(isInReview).length;

test("header shows the total Needs Attention count (Low only)", () => {
  expect(text.split("\n")[0]).toBe("AdMate Briefing");
  const plural = totalLow === 1 ? "campaign needs" : "campaigns need";
  expect(text).toContain(`🔴 ${totalLow} ${plural} attention`);
});

test("each platform WITH Low is listed with its count + affected objectives; zero-Low platforms are omitted", () => {
  const perPlatform: [string, ReturnType<typeof analyzeCampaigns>][] = [
    ["Meta Ads", meta],
    ["TikTok Ads", tiktok],
    ["Google Search", google],
    ["LinkedIn Ads", linkedin],
  ];
  for (const [label, r] of perPlatform) {
    const low = r.findings.filter((f) => f.performance === "Low");
    if (low.length > 0) {
      expect(text).toContain(`${label}: ${low.length}`);
      // Objectives of the Low campaigns, counted: "Sales (2)" etc.
      const counts = new Map<string, number>();
      for (const f of low) counts.set(f.objectiveLabel, (counts.get(f.objectiveLabel) ?? 0) + 1);
      for (const [obj, n] of counts) expect(text).toContain(`${obj} (${n})`);
    } else {
      expect(text).not.toContain(`${label}: 0`);
    }
  }
});

test("a platform with zero Low campaigns is not listed at all", () => {
  // Google, but with every Low removed → its header line must not appear.
  const noLowGoogle: BriefingInput = {
    ...google,
    platform: "google_search",
    findings: google.findings.filter((f) => f.performance !== "Low"),
  };
  const out = briefingPlainText([noLowGoogle]);
  expect(out).not.toContain("Google Search:");
  expect(out).toContain("🔴 0 campaigns need attention");
});

test("data issues and In Review are separate lines, never in the attention count", () => {
  if (totalErrors > 0) {
    expect(text).toContain(`🛑 ${totalErrors} data issue${totalErrors === 1 ? "" : "s"} detected`);
  }
  if (totalReview > 0) {
    expect(text).toContain(`⏳ ${totalReview} campaign${totalReview === 1 ? "" : "s"} in review`);
  }
  // Attention count is Low-only: Error/In Review campaigns are never Low.
  for (const f of all.filter((x) => isError(x) || isInReview(x))) {
    expect(f.performance).not.toBe("Low");
  }
  expect(totalLow).toBe(all.filter((f) => f.performance === "Low").length);
});

test("no full detail leaks into the concise alert", () => {
  for (const banned of [
    "WHAT'S GOING WRONG",
    "KEY EVIDENCE",
    "WHAT TO DO NOW",
    "Confidence:",
    "──────────",
    "vs Target",
    "Baseline",
  ]) {
    expect(text).not.toContain(banned);
  }
  // Campaign names are not included any more (objectives only).
  for (const name of all.map((f) => f.campaignName)) {
    expect(text).not.toContain(name);
  }
});

test("includes a clickable 'View details in AdMate' link to the app", () => {
  expect(html).toContain(
    '👉 <a href="https://admate-insights.vercel.app">View details in AdMate</a>',
  );
  expect(text).toContain("View details in AdMate: https://admate-insights.vercel.app");
  // The link target is overridable.
  expect(buildBriefing(inputs, { appUrl: "https://example.test" })).toContain(
    'href="https://example.test"',
  );
});

test("a briefing that includes LinkedIn builds without crashing and labels it", () => {
  // Regression: LinkedIn must have a SHORT_LABEL entry.
  expect(() => buildBriefing(inputs)).not.toThrow();
  if (lowByPlat["LinkedIn Ads"] > 0) {
    expect(html).toContain(`LinkedIn Ads: ${lowByPlat["LinkedIn Ads"]}`);
  }
});

test("no internal jargon leaks into the message", () => {
  const lower = text.toLowerCase();
  for (const banned of ["deterministic", "priority score", "severity", "objectivefamily", "cmp:"]) {
    expect(lower).not.toContain(banned);
  }
  expect(html).toContain("<b>AdMate Briefing</b>");
});
