import { expect, test } from "bun:test";

import { buildBriefing, briefingPlainText, type BriefingInput } from "./briefing";
import { needsAttentionCount, isNeedsAttention } from "./attention";
import { runAnalysis, runMetaAnalysis, runGoogleSearchAnalysis } from "./analysis/engine";
import { loadNormalizedDailyRows } from "./tiktok/normalize";
import { DemoTikTokDataProvider } from "./tiktok/demo-provider";
import { DemoMetaDataProvider } from "./meta/demo-provider";
import { DemoGoogleSearchDataProvider } from "./google/demo-provider";

const tiktok = runAnalysis(await loadNormalizedDailyRows(new DemoTikTokDataProvider(), 28), 7);
const meta = runMetaAnalysis(await loadNormalizedDailyRows(new DemoMetaDataProvider(), 28), 7);
const google = runGoogleSearchAnalysis(
  await loadNormalizedDailyRows(new DemoGoogleSearchDataProvider(), 28),
  7,
);

// Simulate the approved AI recommendation the AI layer adds at runtime, so the
// "WHAT TO DO NOW" line has content for scored Needs-Attention findings.
for (const r of [tiktok, meta, google]) {
  for (const f of r.findings) {
    if (!f.guidance && !f.aiRecommendedAction) {
      f.aiRecommendedAction = "Refresh the creatives and shift budget toward the best performers.";
    }
  }
}

const inputs: BriefingInput[] = [
  { ...tiktok, platform: "tiktok" },
  { ...meta, platform: "meta" },
  { ...google, platform: "google_search" },
];
const text = briefingPlainText(inputs);

// --- 1. Website count (Performance Rating = Needs Attention only) -----------

test("website count: TikTok is 2 of 9", () => {
  expect(needsAttentionCount(tiktok.findings)).toBe(2);
  expect(tiktok.findings.length).toBe(9);
});

test("counts match the actual visible Needs Attention ratings per platform", () => {
  expect(needsAttentionCount(meta.findings)).toBe(1);
  expect(needsAttentionCount(google.findings)).toBe(0);
  // Every counted finding truly has the exact rating.
  for (const r of [tiktok, meta, google]) {
    for (const f of r.findings.filter(isNeedsAttention)) {
      expect(f.performanceRating).toBe("Needs Attention");
    }
  }
});

test("Check Data with Critical priority is NOT counted as Needs Attention", () => {
  const tracking = tiktok.findings.find((f) => f.signal === "tracking_issue")!;
  expect(tracking.severity).toBe("critical"); // high priority…
  expect(tracking.performanceLabel).toBe("Check Data"); // …but Check Data
  expect(isNeedsAttention(tracking)).toBe(false); // so it is not counted
});

test("Fair / Good / Very Good / Early Data never count as Needs Attention", () => {
  const notCounted = [...tiktok.findings, ...meta.findings, ...google.findings].filter(
    (f) =>
      f.performanceRating === "Fair" ||
      f.performanceRating === "Good" ||
      f.performanceRating === "Very Good" ||
      f.performanceLabel === "Early Data",
  );
  expect(notCounted.length).toBeGreaterThan(0);
  expect(notCounted.every((f) => !isNeedsAttention(f))).toBe(true);
});

// --- 2. Telegram summary ----------------------------------------------------

test("Telegram summary header and per-platform counts match the website counts", () => {
  const lines = text.split("\n");
  expect(lines[0]).toBe("AdMate Briefing");
  expect(text).toContain("🔴 3 campaigns need attention");
  expect(text).toContain(`TikTok Ads: ${needsAttentionCount(tiktok.findings)}`); // 2
  expect(text).toContain(`Meta Ads: ${needsAttentionCount(meta.findings)}`); // 1
  expect(text).toContain(`Google Search: ${needsAttentionCount(google.findings)}`); // 0
});

// --- 3. Details only for Needs Attention ------------------------------------

test("full details appear ONLY for Needs Attention campaigns", () => {
  const expected = [tiktok, meta, google]
    .flatMap((r) => r.findings)
    .filter(isNeedsAttention)
    .map((f) => f.campaignName);
  for (const name of expected) expect(text).toContain(name);
  // A Fair campaign is never named (only compact-counted), so no detail block.
  const fair = tiktok.findings.find((f) => f.performanceRating === "Fair")!;
  expect(text).not.toContain(fair.campaignName);
});

test("each Needs Attention block has the four sections and confidence last", () => {
  const blocks = text.split("──────────").slice(1).map((b) => b.trim());
  // The last "block" may be the Data Check section — only assert on detail blocks.
  const detailBlocks = blocks.filter((b) => b.includes("WHAT'S GOING WRONG"));
  expect(detailBlocks.length).toBe(3); // 2 TikTok + 1 Meta
  for (const b of detailBlocks) {
    expect(b).toContain("WHAT'S GOING WRONG");
    expect(b).toContain("KEY EVIDENCE");
    expect(b).toContain("WHAT TO DO NOW");
    const lines = b.split("\n").filter((l) => l.trim() !== "");
    expect(lines[lines.length - 1]).toMatch(/^Confidence: (High|Medium|Low)$/);
    // KEY EVIDENCE ≤ 3 metrics.
    const start = b.split("\n").findIndex((l) => l.includes("KEY EVIDENCE"));
    const bl = b.split("\n");
    let count = 0;
    for (let i = start + 1; i < bl.length && bl[i].trim() !== ""; i++) count++;
    expect(count).toBeLessThanOrEqual(3);
  }
});

// --- 4. Other states --------------------------------------------------------

test("Check Data is shown separately and never as Needs Attention detail", () => {
  expect(text).toContain("⚠️ Data Check");
  expect(text).toContain("TikTok Ads — Conversions | Checkout Push");
  expect(text).toContain("Meta Ads — Conversions | Checkout Abandoners");
});

test("Fair + Early Data shown as compact counts; Good/Very Good omitted", () => {
  expect(text).toMatch(/Monitoring — Fair: \d+ · Early Data: \d+/);
  // Good / Very Good campaigns must not appear anywhere in the message.
  const good = [...tiktok.findings, ...meta.findings, ...google.findings].filter(
    (f) => f.performanceRating === "Good" || f.performanceRating === "Very Good",
  );
  expect(good.length).toBeGreaterThan(0);
  for (const f of good) expect(text).not.toContain(f.campaignName);
});

// --- 5. Isolation + jargon --------------------------------------------------

test("platform switching does not mix counts (each platform counted from its own findings)", () => {
  // Recomputing per platform independently gives the same numbers shown.
  const perPlatform = {
    tiktok: needsAttentionCount(tiktok.findings),
    meta: needsAttentionCount(meta.findings),
    google_search: needsAttentionCount(google.findings),
  };
  expect(perPlatform).toEqual({ tiktok: 2, meta: 1, google_search: 0 });
  // Total equals the sum, never cross-contaminated.
  const total = perPlatform.tiktok + perPlatform.meta + perPlatform.google_search;
  expect(text).toContain(`🔴 ${total} campaigns need attention`);
});

test("no internal jargon leaks into the message", () => {
  const html = buildBriefing(inputs);
  const lower = briefingPlainText(inputs).toLowerCase();
  for (const banned of ["deterministic", "analyzer", "engine", "severity", "status="]) {
    expect(lower).not.toContain(banned);
  }
  expect(html).toContain("<b>AdMate Briefing</b>");
});
