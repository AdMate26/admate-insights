import { expect, test } from "bun:test";

import { buildBriefing, briefingPlainText, type BriefingInput } from "./briefing";
import {
  needsAttentionCount,
  highPerformanceCount,
  isError,
  isInReview,
  isNeedsAttention,
  isHighPerformance,
} from "./attention";
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

const highByPlat = {
  "Meta Ads": highPerformanceCount(meta.findings),
  "TikTok Ads": highPerformanceCount(tiktok.findings),
  "Google Search": highPerformanceCount(google.findings),
  "LinkedIn Ads": highPerformanceCount(linkedin.findings),
} as const;
const totalHigh = Object.values(highByPlat).reduce((s, n) => s + n, 0);
const totalErrors = all.filter(isError).length;
const totalReview = all.filter(isInReview).length;

test("header shows both performance summary counts (Low + High), from the rating only", () => {
  expect(text.split("\n")[0]).toBe("AdMate Briefing");
  const lowPlural = totalLow === 1 ? "campaign needs" : "campaigns need";
  expect(text).toContain(`🔴 ${totalLow} ${lowPlural} attention`);
  const highPlural = totalHigh === 1 ? "campaign" : "campaigns";
  expect(text).toContain(`🟢 ${totalHigh} ${highPlural} performing strongly`);
});

test("each platform WITH High is listed with its count + objectives; zero-High platforms are omitted", () => {
  const perPlatform: [string, ReturnType<typeof analyzeCampaigns>][] = [
    ["Meta Ads", meta],
    ["TikTok Ads", tiktok],
    ["Google Search", google],
    ["LinkedIn Ads", linkedin],
  ];
  // The 🟢 section is everything from the 🟢 header onward (before the trailer).
  const highSection = text.slice(text.indexOf("🟢"));
  for (const [label, r] of perPlatform) {
    const high = r.findings.filter(isHighPerformance);
    if (high.length > 0) {
      expect(highSection).toContain(`${label}: ${high.length}`);
      const counts = new Map<string, number>();
      for (const f of high) counts.set(f.objectiveLabel, (counts.get(f.objectiveLabel) ?? 0) + 1);
      for (const [obj, n] of counts) expect(highSection).toContain(`${obj} (${n})`);
    } else {
      expect(highSection).not.toContain(`${label}: 0`);
    }
  }
});

test("platform counts add up to the section totals", () => {
  expect(Object.values(lowByPlat).reduce((s, n) => s + n, 0)).toBe(
    all.filter((f) => f.performance === "Low").length,
  );
  expect(Object.values(highByPlat).reduce((s, n) => s + n, 0)).toBe(
    all.filter((f) => f.performance === "High").length,
  );
});

test("Moderate (Good/Fair) is never alerted in either section", () => {
  const moderates = all.filter((f) => f.performance === "Moderate");
  expect(moderates.length).toBeGreaterThan(0);
  for (const f of moderates) {
    expect(isNeedsAttention(f)).toBe(false);
    expect(isHighPerformance(f)).toBe(false);
  }
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

test("a platform with zero Low campaigns is not listed in the 🔴 section", () => {
  // Google, but with every Low removed → it must not appear in the 🔴 section
  // (it may still appear under 🟢 if it has High campaigns).
  const noLowGoogle: BriefingInput = {
    ...google,
    platform: "google_search",
    findings: google.findings.filter((f) => f.performance !== "Low"),
  };
  const out = briefingPlainText([noLowGoogle]);
  expect(out).toContain("🔴 0 campaigns need attention");
  const lowSection = out.slice(out.indexOf("🔴"), out.indexOf("🟢"));
  expect(lowSection).not.toContain("Google Search:");
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
