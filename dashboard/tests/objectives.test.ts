import { describe, expect, it } from "vitest";
import { normalizeTable } from "@/lib/ingest/normalize";
import { analyze } from "@/lib/analysis/analyze";
import { kpiShort, objectiveFromName, resultCount } from "@/lib/metrics/objectives";
import { emptyMeasures } from "@/lib/metrics/measures";
import { SAMPLE_ACCOUNT } from "@/lib/sample/generate";
import { inputFor } from "./helpers";

// App installs, app registrations and website visits: read from exports, and judged
// by their own result (cost per install / registration / landing page view).

const csv = (rows: string[]) => Buffer.from(rows.join("\n"));

describe("new objectives in exports", () => {
  it("Meta: the result indicator decides website visits and app registrations", () => {
    const p = normalizeTable(
      csv([
        "Campaign name,Day,Result indicator,Results,Amount spent (USD),Impressions,Link clicks",
        "Blog traffic,2026-09-01,actions:landing_page_view,120,40,10000,160",
        "Rewards app signup,2026-09-01,actions:app_custom_event.fb_mobile_complete_registration,30,60,20000,250",
        "Newsletter,2026-09-01,offsite_conversion.fb_pixel_complete_registration,25,50,15000,200",
        "Rewards app,2026-09-01,actions:mobile_app_install,80,90,30000,400",
      ]),
      "meta.csv",
    );
    const by = (name: string) => p.rows.find((r) => r.campaign === name)!;
    expect(by("Blog traffic")).toMatchObject({ objective: "website_visits", objectiveSource: "result_type" });
    expect(by("Blog traffic").measures.landingPageViews).toBe(120);
    expect(by("Rewards app signup")).toMatchObject({ objective: "app_registrations" });
    expect(by("Rewards app signup").measures.registrations).toBe(30);
    // A website sign-up is a lead, not an app registration (and not a purchase).
    expect(by("Newsletter")).toMatchObject({ objective: "leads" });
    expect(by("Newsletter").measures.leads).toBe(25);
    expect(by("Rewards app")).toMatchObject({ objective: "app_installs" });
    expect(p.measuresPresent).toEqual(expect.arrayContaining(["landingPageViews", "registrations", "installs"]));
  });

  it("TikTok: an App promotion campaign that reports registrations is judged by registrations", () => {
    const p = normalizeTable(
      csv([
        "Campaign name,By Day,Advertising objective,Cost,Impressions,Clicks (destination),Registration (App),Primary status",
        "Rewards sign-ups,2026-09-01,App promotion,30,20000,240,28,Active",
      ]),
      "tiktok.csv",
    );
    expect(p.rows[0]).toMatchObject({ objective: "app_registrations" });
    expect(p.rows[0].measures.registrations).toBe(28);
  });

  it("guesses the objective from campaign names", () => {
    expect(objectiveFromName("App | Sign up | Rewards")).toBe("app_registrations");
    expect(objectiveFromName("App registrations - Sep")).toBe("app_registrations");
    expect(objectiveFromName("Website | Landing page view | Blog")).toBe("website_visits");
    expect(objectiveFromName("LPV - skin guide")).toBe("website_visits");
    expect(objectiveFromName("Lead form | Quiz")).toBe("leads");
    expect(objectiveFromName("App install | Android")).toBe("app_installs");
  });

  it("counts each objective's own result", () => {
    const m = { ...emptyMeasures(), linkClicks: 100, landingPageViews: 70, installs: 20, registrations: 8 };
    expect(resultCount(m, "website_visits")).toBe(70);
    expect(resultCount(m, "traffic")).toBe(100);
    expect(resultCount(m, "app_registrations")).toBe(8);
    expect(resultCount(m, "app_installs")).toBe(20);
  });

  it("judges the sample's app and website campaigns by their own cost per result", () => {
    const a = analyze(inputFor(SAMPLE_ACCOUNT));
    const obj = (o: string) => a.objectives.find((x) => x.objective === o)!;
    expect(kpiShort("website_visits", obj("website_visits").mode)).toBe("Cost/LPV");
    expect(obj("app_registrations").kpiB).toBeCloseTo(obj("app_registrations").b.spend / obj("app_registrations").b.registrations, 6);
    expect(obj("app_installs").kpiB).toBeGreaterThan(0);
  });
});
