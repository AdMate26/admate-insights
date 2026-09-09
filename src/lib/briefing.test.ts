import { expect, test } from "bun:test";

import { buildBriefing, briefingPlainText, type BriefingInput } from "./briefing";
import { needsAttentionCount, isError } from "./attention";
import { analyzeCampaigns } from "./analysis/engine";
import { getDemoCampaigns } from "./analysis/demo";

const meta = analyzeCampaigns(getDemoCampaigns("meta"));
const tiktok = analyzeCampaigns(getDemoCampaigns("tiktok"));
const google = analyzeCampaigns(getDemoCampaigns("google_search"));

// Simulate the approved AI recommendation the AI layer adds at runtime.
for (const r of [meta, tiktok, google]) {
  for (const f of r.findings) if (!f.aiRecommendedAction) f.aiRecommendedAction = f.action;
}

const inputs: BriefingInput[] = [
  { ...meta, platform: "meta" },
  { ...tiktok, platform: "tiktok" },
  { ...google, platform: "google_search" },
];
const text = briefingPlainText(inputs);

const lowMeta = needsAttentionCount(meta.findings);
const lowTikTok = needsAttentionCount(tiktok.findings);
const lowGoogle = needsAttentionCount(google.findings);
const totalLow = lowMeta + lowTikTok + lowGoogle;

test("summary counts only Performance = Low, per platform, matching the dashboard", () => {
  expect(text.split("\n")[0]).toBe("AdMate Briefing");
  expect(text).toContain(`🔴 ${totalLow} campaigns need attention`);
  expect(text).toContain(`Meta Ads: ${lowMeta}`);
  expect(text).toContain(`TikTok Ads: ${lowTikTok}`);
  expect(text).toContain(`Google Search: ${lowGoogle}`);
});

test("full details appear only for Low campaigns", () => {
  const lowNames = [...meta.findings, ...tiktok.findings, ...google.findings]
    .filter((f) => f.performance === "Low")
    .map((f) => f.campaignName);
  for (const name of lowNames) expect(text).toContain(name);

  // High / Moderate campaigns are omitted from the briefing entirely.
  const omit = [...meta.findings, ...tiktok.findings, ...google.findings].filter(
    (f) => f.performance === "High" || f.performance === "Moderate",
  );
  for (const f of omit) expect(text).not.toContain(f.campaignName);
});

test("Error/tracking campaigns are listed separately, never counted as attention", () => {
  const errors = [...meta.findings, ...tiktok.findings, ...google.findings].filter(isError);
  expect(errors.length).toBeGreaterThan(0);
  expect(text).toContain("Data / tracking to fix");
  for (const f of errors) {
    expect(text).toContain(f.campaignName);
    expect(f.performance).not.toBe("Low"); // not double-counted
  }
});

test("In Review is shown as a compact count, not full details", () => {
  const reviewing = [...meta.findings, ...tiktok.findings, ...google.findings].filter(
    (f) => f.performance === "In Review",
  );
  expect(reviewing.length).toBeGreaterThan(0);
  expect(text).toMatch(/⏳ \d+ campaigns? in review/);
});

test("each Low detail block has the four sections and confidence", () => {
  const blocks = text.split("──────────").slice(1).map((b) => b.trim());
  const detailBlocks = blocks.filter((b) => b.includes("WHAT'S GOING WRONG"));
  expect(detailBlocks.length).toBe(totalLow);
  for (const b of detailBlocks) {
    expect(b).toContain("WHAT'S GOING WRONG");
    expect(b).toContain("KEY EVIDENCE");
    expect(b).toContain("WHAT TO DO NOW");
    expect(b).toMatch(/Confidence: (High|Medium|Low)/);
  }
});

test("no internal jargon leaks into the message", () => {
  const lower = briefingPlainText(inputs).toLowerCase();
  for (const banned of ["deterministic", "priority score", "severity", "objectivefamily", "cmp:"]) {
    expect(lower).not.toContain(banned);
  }
  expect(buildBriefing(inputs)).toContain("<b>AdMate Briefing</b>");
});

test("a briefing that includes LinkedIn builds without crashing and labels it", () => {
  // Regression: LinkedIn was in PLATFORM_ORDER but missing from SHORT_LABEL, so
  // any brand connecting LinkedIn crashed the briefing with
  // "Cannot read properties of undefined (reading 'replace')".
  const linkedin = analyzeCampaigns(getDemoCampaigns("linkedin"));
  const withLi: BriefingInput[] = [...inputs, { ...linkedin, platform: "linkedin" }];
  expect(() => buildBriefing(withLi)).not.toThrow();
  const html = buildBriefing(withLi);
  const lowLinkedIn = needsAttentionCount(linkedin.findings);
  expect(html).toContain(`LinkedIn Ads: ${lowLinkedIn}`);
  expect(briefingPlainText(withLi)).toContain("LinkedIn Ads");
});
