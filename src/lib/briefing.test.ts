import { expect, test } from "bun:test";

import { buildBriefing, briefingPlainText } from "./briefing";
import { runMetaAnalysis } from "./analysis/engine";
import { loadNormalizedDailyRows } from "./tiktok/normalize";
import { DemoMetaDataProvider } from "./meta/demo-provider";

/**
 * The Meta demo contains all four required cases in one run:
 *   creative fatigue, cost-per-result (CPA) deterioration, tracking issue, early data.
 * We simulate the approved AI recommendation on scored findings (the AI layer
 * adds these at runtime) and assert the plain-language briefing structure.
 */
const meta = runMetaAnalysis(await loadNormalizedDailyRows(new DemoMetaDataProvider(), 28), 7);
for (const f of meta.findings) {
  if (!f.guidance && !f.aiRecommendedAction) {
    f.aiRecommendedAction = "Add 2–3 new creatives and test them against the current ads.";
  }
}
const input = { ...meta, platform: "meta" as const };
const text = briefingPlainText(input);

/** Split the message into per-campaign blocks (separated by the divider). */
function blocks(t: string): string[] {
  return t.split("──────────").slice(1).map((b) => b.trim());
}
const blockFor = (needle: string) => blocks(text).find((b) => b.includes(needle))!;

// --- Header -----------------------------------------------------------------

test("header is concise: platform, spend, attention count, short date range", () => {
  const lines = text.split("\n");
  expect(lines[0]).toBe("AdMate Briefing — Meta Ads");
  expect(lines[1]).toMatch(/^Spend: \$[\d,]+ · \d+ campaigns? need(s)? attention$/);
  expect(lines[2]).toMatch(/^Comparing [A-Z][a-z]{2} \d+–.+ vs [A-Z][a-z]{2} \d+–.+\.$/);
});

// --- The four required scenarios --------------------------------------------

test("creative fatigue reads in plain language with translated evidence", () => {
  const b = blockFor("Prospecting | Advantage+ Broad");
  expect(b).toContain("Needs Attention · 44");
  expect(b).toContain("WHAT'S GOING WRONG");
  expect(b).toContain("Your audience is getting tired of these ads.");
  expect(b).toContain("Frequency ↑");
  expect(b).toContain("people are seeing the ads more often");
});

test("CPA deterioration reads in plain language", () => {
  const b = blockFor("Retargeting | 30d Site Visitors");
  expect(b).toMatch(/Fair · \d+/);
  expect(b).toContain("Your results are costing more than they used to.");
  expect(b).toContain("CPA ↑");
  expect(b).toContain("each result costs more");
});

test("tracking issue shows Check Data, verify-tracking action and capped steps", () => {
  const b = blockFor("Conversions | Checkout Abandoners");
  expect(b).toContain("Check Data");
  expect(b).not.toMatch(/Check Data · \d/); // no score for tracking issue
  expect(b).toContain("conversion tracking may not be recording");
  expect(b).toContain("Verify conversion tracking before changing budget");
  // At most 2 supporting steps.
  expect((b.match(/^• /gm) ?? []).length).toBeLessThanOrEqual(2);
});

test("early data shows Early Data, a volume note and a wait recommendation", () => {
  const b = blockFor("Test | New Creator Angle");
  expect(b).toContain("Early Data");
  expect(b).not.toMatch(/Early Data · \d/);
  expect(b).toContain("not enough data yet");
  expect(b).toContain("too little data to give a score yet");
  expect(b).toContain("Continue collecting results");
});

// --- Format rules -----------------------------------------------------------

test("each flagged campaign has the four sections and confidence at the end", () => {
  for (const b of blocks(text)) {
    expect(b).toContain("WHAT'S GOING WRONG");
    expect(b).toContain("KEY EVIDENCE");
    expect(b).toContain("WHAT TO DO NOW");
    const lines = b.split("\n").filter((l) => l.trim() !== "");
    expect(lines[lines.length - 1]).toMatch(/^Confidence: (High|Medium|Low)$/);
  }
});

test("KEY EVIDENCE lists at most 3 metrics per campaign", () => {
  for (const b of blocks(text)) {
    const lines = b.split("\n");
    const start = lines.findIndex((l) => l.includes("KEY EVIDENCE"));
    let count = 0;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === "") break;
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(3);
  }
});

test("no internal jargon or engine-architecture phrases leak into the message", () => {
  const lower = text.toLowerCase();
  for (const banned of ["deterministic", "analyzer", "engine", "signal", "severity", "classif"]) {
    expect(lower).not.toContain(banned);
  }
});

test("uses the approved AI / guidance recommendation, not an invented one", () => {
  // Scored finding with injected AI recommendation surfaces verbatim.
  expect(blockFor("Prospecting | Advantage+ Broad")).toContain(
    "Add 2–3 new creatives and test them against the current ads.",
  );
});

test("HTML build escapes and uses bold section headers", () => {
  const html = buildBriefing(input);
  expect(html).toContain("<b>AdMate Briefing — Meta Ads</b>");
  expect(html).toContain("<b>WHAT'S GOING WRONG</b>");
  expect(html).toContain("<b>KEY EVIDENCE</b>");
});
