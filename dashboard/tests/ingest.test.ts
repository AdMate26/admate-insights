import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { normalizeTable } from "@/lib/ingest/normalize";
import { parseNumber } from "@/lib/ingest/parse";
import { periodFromFilename, periodFromText, parseDateCell } from "@/lib/dates";

function csv(rows: (string | number)[][]): Buffer {
  const cell = (c: string | number) => (String(c).includes(",") ? `"${c}"` : String(c));
  return Buffer.from(rows.map((r) => r.map(cell).join(",")).join("\n"));
}

describe("parseNumber", () => {
  it("handles export number formats", () => {
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("12,345,678")).toBe(12345678);
    expect(parseNumber("$0.14")).toBe(0.14);
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(42)).toBe(42);
  });
});

describe("dates", () => {
  it("parses file-name periods", () => {
    expect(periodFromFilename("Cam-He-Campaigns-Mar-1-2026-Mar-31-2026.xlsx")).toEqual({ start: "2026-03-01", end: "2026-03-31", guessed: false });
    expect(periodFromFilename("Report_2026_08_01_to_2026_08_31.xlsx")).toEqual({ start: "2026-08-01", end: "2026-08-31", guessed: false });
    expect(periodFromFilename("KH_TT_Report_2026_08_01_to_2026_08.xlsx")).toEqual({ start: "2026-08-01", end: "2026-08-31", guessed: true });
  });
  it("parses title-row periods and cells", () => {
    expect(periodFromText(["Campaign report", "September 1, 2026 - September 30, 2026"])).toEqual({ start: "2026-09-01", end: "2026-09-30", guessed: false });
    expect(parseDateCell("2026-03-01")).toBe("2026-03-01");
    expect(parseDateCell("9/30/2026")).toBe("2026-09-30");
    expect(parseDateCell("30/09/2026")).toBe("2026-09-30");
    expect(parseDateCell("Sep 1, 2026")).toBe("2026-09-01");
  });
});

describe("normalizeTable (synthetic exports)", () => {
  it("reads a Google Ads daily export with title rows", () => {
    const buf = csv([
      ["Campaign report"],
      ["September 1, 2026 - September 2, 2026"],
      ["Day", "Campaign", "Campaign type", "Cost", "Impr.", "Clicks", "Conversions", "Conv. value"],
      ["2026-09-01", "Brand Search", "Search", "120.50", "10,000", "500", "25", "2500"],
      ["2026-09-02", "Brand Search", "Search", "110.00", "9,000", "450", "20", "2000"],
      ["Total: Account", "", "", "230.50", "19000", "950", "45", "4500"],
    ]);
    const p = normalizeTable(buf, "google.csv");
    expect(p.platform).toBe("google");
    expect(p.granularity).toBe("daily");
    expect(p.period).toMatchObject({ start: "2026-09-01", end: "2026-09-02" });
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].objective).toBe("sales");
    expect(p.rows[0].measures.spend).toBe(120.5);
    expect(p.rows[0].measures.impressions).toBe(10000);
  });

  it("reads a LinkedIn export", () => {
    const buf = csv([
      ["Start Date (in UTC)", "Campaign Name", "Campaign Group Name", "Campaign Objective", "Total Spent", "Impressions", "Clicks", "Leads", "Lead Form Opens"],
      ["9/1/2026", "B2B Leads", "Group A", "Lead generation", "300", "20000", "120", "12", "40"],
    ]);
    const p = normalizeTable(buf, "linkedin.csv");
    expect(p.platform).toBe("linkedin");
    expect(p.rows[0].objective).toBe("leads");
    expect(p.rows[0].measures.leads).toBe(12);
    expect(p.rows[0].measures.leadFormOpens).toBe(40);
  });
});

// Real exports supplied by the founder. They live in fixtures/private (git-ignored),
// so these tests are skipped on machines that don't have them.
const META = "fixtures/private/Cam-He-Campaigns-Mar-1-2026-Mar-31-2026.xlsx";
const TIKTOK = "fixtures/private/KH_TT_HeBE_MaryMay_Cambodia_Campaign_Report_2026_08_01_to_2026_08.xlsx";

describe.skipIf(!existsSync(META))("real Meta export", () => {
  it("normalizes campaigns, objectives and the reporting period", () => {
    const p = normalizeTable(readFileSync(META), META.split("/").pop()!);
    expect(p.platform).toBe("meta");
    expect(p.granularity).toBe("snapshot");
    expect(p.period).toMatchObject({ start: "2026-03-01", end: "2026-03-31", source: "columns" });
    expect(p.currency).toBe("USD");
    expect(p.rows).toHaveLength(9);
    const kol = p.rows.find((r) => r.campaign === "MM-awareness-KOL Kak Review")!;
    expect(kol.objective).toBe("awareness");
    expect(kol.measures.spend).toBeCloseTo(86.27);
    expect(kol.measures.reach).toBe(575170);
    const likes = p.rows.find((r) => r.campaign === "MM-Page Follower-Focus Cities")!;
    expect(likes.objective).toBe("followers");
    expect(likes.measures.follows).toBe(1569);
    const eng = p.rows.find((r) => r.campaign === "Hebe- Recruitment")!;
    expect(eng.objective).toBe("engagement");
    expect(eng.measures.engagements).toBe(798);
  });
});

describe.skipIf(!existsSync(TIKTOK))("real TikTok export", () => {
  it("skips the total row, infers objectives from names and guesses the period", () => {
    const p = normalizeTable(readFileSync(TIKTOK), TIKTOK.split("/").pop()!);
    expect(p.platform).toBe("tiktok");
    expect(p.rows).toHaveLength(14);
    expect(p.skippedRows).toBe(1);
    expect(p.period).toMatchObject({ start: "2026-08-01", end: "2026-08-31", guessed: true, source: "filename" });
    const follower = p.rows.find((r) => r.campaign.startsWith("MM-Increase Follower-06 Aug"))!;
    expect(follower.objective).toBe("followers");
    expect(follower.measures.follows).toBe(9581);
    expect(follower.measures.spend).toBeCloseTo(152.31);
    const vv = p.rows.find((r) => r.campaign.startsWith("MM- Video View- UGC"))!;
    expect(vv.objective).toBe("video_views");
    expect(vv.measures.videoViews).toBe(159517);
    expect(vv.secondaryStatus).toBe("Out of campaign budget");
    const total = p.rows.reduce((s, r) => s + r.measures.spend, 0);
    expect(total).toBeCloseTo(323.84);
  });
});

// Keep XLSX import used so tree-shaking in tests matches the app.
void XLSX.version;

describe("measures present in the export", () => {
  it("lists only columns the file has, so a missing column is never read as zero", () => {
    const withConv = normalizeTable(
      csv([
        ["Day", "Campaign", "Campaign type", "Cost", "Impr.", "Clicks", "Conversions"],
        ["2026-09-01", "Brand Search", "Search", "120.50", "10000", "500", "25"],
      ]),
      "google.csv",
    );
    expect(withConv.measuresPresent).toContain("conversions");
    expect(withConv.measuresPresent).toContain("spend");

    const noConv = normalizeTable(
      csv([
        ["Day", "Campaign", "Campaign type", "Cost", "Impr.", "Clicks"],
        ["2026-09-01", "Brand Search", "Search", "120.50", "10000", "500"],
      ]),
      "google.csv",
    );
    expect(noConv.measuresPresent).not.toContain("conversions");
    expect(noConv.measuresPresent).not.toContain("leads");
  });
});
