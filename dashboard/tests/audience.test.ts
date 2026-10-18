import { describe, expect, it } from "vitest";
import { normalizeTable } from "@/lib/ingest/normalize";
import { judgeSegments, simulatedSplit } from "@/lib/analysis/audience";

// Breakdown exports (Audience insight) are recognised, named per group, and never
// mistaken for ordinary campaign reports.

const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(",")).join("\n"));

describe("breakdown exports", () => {
  it("reads a Meta age & gender export into named groups", () => {
    const p = normalizeTable(
      csv([
        ["Campaign name", "Age", "Gender", "Reporting starts", "Reporting ends", "Result indicator", "Results", "Amount spent (USD)", "Impressions", "Attribution setting"],
        ["Leads | Skin quiz", "25-34", "female", "2026-10-01", "2026-10-31", "actions:lead", "120", "300", "40000", "7-day click"],
        ["Leads | Skin quiz", "25-34", "male", "2026-10-01", "2026-10-31", "actions:lead", "20", "150", "20000", "7-day click"],
        ["Leads | Skin quiz", "65+", "unknown", "2026-10-01", "2026-10-31", "actions:lead", "1", "5", "900", "7-day click"],
      ]),
      "meta-age-gender.csv",
    );
    expect(p.platform).toBe("meta");
    expect(p.breakdown).toBe("age_gender");
    expect(p.rows.map((r) => r.segment)).toEqual(["Women 25–34", "Men 25–34", "Unknown gender 65+"]);
    expect(p.rows[0].measures.leads).toBe(120);
    expect(p.warnings[0]).toMatch(/breakdown export \(Age & gender\)/);
  });

  it("combines Meta's platform and placement, and reads hours", () => {
    const place = normalizeTable(
      csv([
        ["Campaign name", "Platform", "Placement", "Reporting starts", "Reporting ends", "Amount spent (USD)", "Impressions", "Link clicks"],
        ["Traffic | Blog", "instagram", "reels", "2026-10-01", "2026-10-31", "80", "9000", "300"],
        ["Traffic | Blog", "facebook", "Facebook Stories", "2026-10-01", "2026-10-31", "40", "5000", "90"],
      ]),
      "meta-placement.csv",
    );
    expect(place.breakdown).toBe("placement");
    expect(place.rows.map((r) => r.segment)).toEqual(["Instagram Reels", "Facebook Stories"]);

    const hour = normalizeTable(
      csv([
        ["Campaign name", "Time of day (ad account time zone)", "Reporting starts", "Reporting ends", "Amount spent (USD)", "Impressions"],
        ["Awareness | Brand", "19:00:00 - 19:59:59", "2026-10-01", "2026-10-31", "12", "8000"],
      ]),
      "meta-hour.csv",
    );
    expect(hour.breakdown).toBe("hour");
    expect(hour.rows[0].segment).toBe("19:00");
  });

  it("leaves ordinary campaign exports alone", () => {
    const p = normalizeTable(
      csv([
        ["Campaign name", "Day", "Result indicator", "Results", "Amount spent (USD)", "Impressions"],
        ["Leads | Skin quiz", "2026-10-01", "actions:lead", "10", "20", "3000"],
      ]),
      "meta-daily.csv",
    );
    expect(p.breakdown).toBeNull();
    expect(p.rows[0].segment).toBeNull();
  });
});

describe("judging groups", () => {
  it("calls a group best or costly only when the difference is clear", () => {
    const r = judgeSegments(
      [
        { name: "Women 25–34", spend: 500, results: 400 }, // index ≈ 1.6
        { name: "Men 45+", spend: 300, results: 60 }, // index ≈ 0.4
        { name: "Women 18–24", spend: 200, results: 140 },
        { name: "Tiny", spend: 10, results: 2 },
      ],
      "cost",
      "age_gender",
    );
    const v = Object.fromEntries(r.rows.map((x) => [x.name, x.verdict]));
    expect(v["Women 25–34"]).toBe("best");
    expect(v["Men 45+"]).toBe("costly");
    expect(v.Tiny).toBe("small");
  });

  it("simulated sample splits add up to the real totals", () => {
    const s = simulatedSplit("location", "Leads | Skin quiz", "meta", 1234.5, 317);
    expect(s.reduce((t, x) => t + x.spend, 0)).toBeCloseTo(1234.5, 6);
    expect(s.reduce((t, x) => t + x.results, 0)).toBe(317);
  });
});
