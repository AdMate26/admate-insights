import { expect, test } from "bun:test";

import { runAnalysis, runMetaAnalysis, runGoogleSearchAnalysis } from "./engine";
import { loadNormalizedDailyRows } from "../tiktok/normalize";
import { DemoTikTokDataProvider } from "../tiktok/demo-provider";
import { DemoMetaDataProvider } from "../meta/demo-provider";
import { DemoGoogleSearchDataProvider } from "../google/demo-provider";
import { buildBriefing } from "../briefing";

const tiktok = runAnalysis(await loadNormalizedDailyRows(new DemoTikTokDataProvider(), 28), 7);
const meta = runMetaAnalysis(await loadNormalizedDailyRows(new DemoMetaDataProvider(), 28), 7);
const google = runGoogleSearchAnalysis(
  await loadNormalizedDailyRows(new DemoGoogleSearchDataProvider(), 28),
  7,
);

const byId = (r: typeof meta) => new Map(r.findings.map((f) => [f.campaignId, f]));
const labels = (r: typeof meta, id: string) =>
  (r.findings.find((f) => f.campaignId === id)?.evidence.metrics ?? []).map((m) => m.label);

// --- Meta: 6 intended scenarios ---------------------------------------------

test("Meta: all 6 scenarios produce the intended platform-specific findings", () => {
  const m = byId(meta);
  expect(meta.findings.length).toBe(6);
  expect(m.get("m_2001")?.signal).toBe("creative_fatigue");
  expect(m.get("m_2002")?.signal).toBe("cpa_deterioration"); // cost-per-result deterioration
  expect(m.get("m_2003")?.signal).toBe("strong_improvement");
  expect(m.get("m_2004")?.signal).toBe("cpm_spike"); // delivery-cost pressure
  expect(m.get("m_2005")?.signal).toBe("tracking_issue");
  expect(m.get("m_2006")?.signal).toBe("low_volume"); // early / insufficient data
  expect(m.get("m_2006")?.performanceLabel).toBe("Early Data");
  expect(m.get("m_2005")?.performanceLabel).toBe("Check Data");
});

test("Meta evidence uses Meta-appropriate rows (Results / Reach / Frequency)", () => {
  const l = labels(meta, "m_2001");
  expect(l).toContain("Results");
  expect(l).toContain("Cost per result");
  expect(l).toContain("Reach");
  expect(l).toContain("Frequency (avg daily)");
  // Meta must NOT reuse Search-only or TikTok-only phrasing.
  expect(l).not.toContain("Search impression share");
  expect(l).not.toContain("Cost per result (CPA)");
});

// --- Google Search: 4 intended scenarios ------------------------------------

test("Google Search: all 4 scenarios produce the intended platform-specific findings", () => {
  const g = byId(google);
  expect(google.findings.length).toBe(4);
  expect(g.get("g_3001")?.signal).toBe("cpa_deterioration"); // CPA / rising CPC
  expect(g.get("g_3002")?.signal).toBe("lost_impression_share"); // visibility / budget-rank
  expect(g.get("g_3003")?.signal).toBe("ctr_drop"); // search-relevance weakness
  expect(g.get("g_3004")?.signal).toBe("strong_improvement"); // conversion value / ROAS
});

test("Google evidence uses Search-appropriate rows (impression share, lost IS, CPC)", () => {
  const l = labels(google, "g_3002");
  expect(l).toContain("Search impression share");
  expect(l).toContain("Lost IS (budget)");
  expect(l).toContain("Lost IS (rank)");
  expect(l).toContain("Cost per conversion");
  expect(l).toContain("CPC (avg)");
  expect(l).toContain("Conversion value");
});

// --- Platform isolation: no mixing of data or logic -------------------------

test("switching platform does not mix data or logic", () => {
  // Each platform yields its own campaign set (disjoint id prefixes).
  expect(tiktok.findings.length).toBe(9);
  expect(tiktok.findings.every((f) => f.campaignId.startsWith("c_"))).toBe(true);
  expect(meta.findings.every((f) => f.campaignId.startsWith("m_"))).toBe(true);
  expect(google.findings.every((f) => f.campaignId.startsWith("g_"))).toBe(true);

  const ids = new Set([
    ...tiktok.findings.map((f) => f.campaignId),
    ...meta.findings.map((f) => f.campaignId),
    ...google.findings.map((f) => f.campaignId),
  ]);
  expect(ids.size).toBe(9 + 6 + 4); // all distinct

  // Evidence vocabulary differs per platform → logic is not shared blindly.
  expect(labels(tiktok, tiktok.findings[0].campaignId)).toContain("Frequency (avg daily)");
  expect(labels(google, "g_3001")).toContain("Search impression share");
  expect(labels(meta, "m_2001")).not.toContain("Search impression share");
  expect(labels(tiktok, tiktok.findings[0].campaignId)).not.toContain("Search impression share");
});

// --- Telegram briefing uses the selected platform ---------------------------

test("Telegram briefing header reflects the selected platform", () => {
  const t = buildBriefing({ ...tiktok, platform: "tiktok" });
  const m = buildBriefing({ ...meta, platform: "meta" });
  const g = buildBriefing({ ...google, platform: "google_search" });
  expect(t).toContain("AdMate Briefing — TikTok Ads");
  expect(m).toContain("AdMate Briefing — Meta Ads");
  expect(g).toContain("AdMate Briefing — Google Ads — Search");
});

// --- Common output structure + detail flow ----------------------------------

test("every platform produces the one common AdMate output structure", () => {
  for (const r of [tiktok, meta, google]) {
    for (const f of r.findings) {
      expect(typeof f.signal).toBe("string");
      expect(typeof f.signalLabel).toBe("string");
      expect(typeof f.confidence).toBe("string");
      expect(typeof f.severity).toBe("string");
      expect(typeof f.severityScore).toBe("number"); // priority
      expect(typeof f.performanceLabel).toBe("string");
      expect(typeof f.whatChanged).toBe("string");
      expect(typeof f.whyItMatters).toBe("string"); // reason
      expect(typeof f.snapshot.spend).toBe("number"); // spend
      expect(typeof f.timing.label).toBe("string"); // campaign timing
      expect(Array.isArray(f.evidence.metrics)).toBe(true);
      expect(f.evidence.metrics.length).toBeGreaterThan(0);
      // Scored signals carry a rating; Early/Check Data carry null score.
      if (f.performanceScore !== null) {
        expect(f.performanceRating).not.toBeNull();
      } else {
        expect(["Early Data", "Check Data"]).toContain(f.performanceLabel);
      }
    }
  }
});

test("campaign detail lookup by id works for Meta and Google (existing flow)", () => {
  const metaFinding = meta.findings.find((f) => f.campaignId === "m_2001");
  const googleFinding = google.findings.find((f) => f.campaignId === "g_3002");
  expect(metaFinding).toBeDefined();
  expect(googleFinding).toBeDefined();
  // Detail view reads these evidence spend fields for its summary card.
  expect(metaFinding!.evidence.metrics.find((x) => x.label === "Spend")).toBeDefined();
  expect(googleFinding!.evidence.metrics.find((x) => x.label === "Spend")).toBeDefined();
});
