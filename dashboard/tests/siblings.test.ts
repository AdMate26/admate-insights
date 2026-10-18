import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/analyze";
import { computePlan } from "@/lib/analysis/plan";
import { planDetail } from "@/lib/analysis/detail";
import { resolveSelection, type Coverage } from "@/lib/analysis/periods";
import { emptyMeasures, type Measures } from "@/lib/metrics/measures";
import type { AnalysisInput, CampaignInfo, FactRow } from "@/lib/analysis/types";

// An ad is judged against its siblings: the other ads in the same ad set, which
// share its audience and budget (a creative test). Never against ads elsewhere.

const m = (x: Partial<Measures>): Measures => ({ ...emptyMeasures(), ...x });
const base = { platform: "meta" as const, objective: "leads" as const, objectiveSource: "result_type", status: "active", secondaryStatus: null, budget: null, firstSeen: "2026-03-01", lastSeen: "2026-03-31" };
const cov: Coverage = { hasData: true, hasDaily: false, minDate: "2026-03-01", maxDate: "2026-03-31", dailyFrom: null, dailyTo: null, snapshots: [], reports: [] };

function input(): AnalysisInput {
  const campaign: CampaignInfo = { ...base, id: "c", name: "Leads | Skin quiz" };
  const sets: CampaignInfo[] = [
    { ...base, id: "sA", name: "Broad audience", level: "ad_group", campaignId: "c", parentName: campaign.name, parentId: "c" },
    { ...base, id: "sB", name: "Interest audience", level: "ad_group", campaignId: "c", parentName: campaign.name, parentId: "c" },
  ];
  const ads: CampaignInfo[] = [
    { ...base, id: "a1", name: "UGC video", level: "ad", campaignId: "c", parentName: "Broad audience", parentId: "sA" },
    { ...base, id: "a2", name: "Static offer", level: "ad", campaignId: "c", parentName: "Broad audience", parentId: "sA" },
    { ...base, id: "b1", name: "Static offer", level: "ad", campaignId: "c", parentName: "Interest audience", parentId: "sB" },
  ];
  const fact = (adGroupId: string, adId: string, x: Measures): FactRow => ({ importId: "imp", campaignId: "c", adGroupId, adId, platform: "meta", granularity: "snapshot", periodStart: "2026-03-01", periodEnd: "2026-03-31", measures: x });
  const facts = [
    fact("sA", "a1", m({ spend: 400, impressions: 80000, linkClicks: 1200, leads: 200 })), // $2.00
    fact("sA", "a2", m({ spend: 400, impressions: 80000, linkClicks: 900, leads: 80 })), //  $5.00
    fact("sB", "b1", m({ spend: 400, impressions: 80000, linkClicks: 900, leads: 80 })), //  $5.00, alone in its ad set
  ];
  return {
    workspace: { id: "w", name: "T", currency: "USD" }, goals: [], campaigns: [campaign], entities: [...sets, ...ads], coverage: cov,
    selection: resolveSelection({ from: "2026-03-01", to: "2026-03-31", cmp: "none" }, cov)!,
    factsB: facts, factsA: [], recentDaily: [], today: "2026-04-02",
  };
}

describe("ads are compared with the other ads in their ad set", () => {
  const a = analyze(input());
  const plan = computePlan(a, "ad");
  const ad = (id: string) => plan.find((p) => p.row.info.id === id)!;

  it("judges the weaker ad against its sibling, with ad advice (no budget of its own)", () => {
    const p = ad("a2");
    expect(p.yardKind).toBe("others");
    expect(p.yardValue).toBeCloseTo(2, 6); // its sibling's cost per lead, not the whole account's
    expect(p.peerName).toBe("the other ad in its ad set (Broad audience)");
    expect(p).toMatchObject({ stance: "cut", priority: "high", label: "Pause or replace" });
    expect(p.action).toMatch(/Pause this ad or replace it/);
    expect(planDetail(a, p).judgedBy.join(" ")).toMatch(/other ads in its ad set first/);
  });

  it("calls the stronger ad 'make more like it', not 'put more money in'", () => {
    const p = ad("a1");
    expect(p).toMatchObject({ stance: "scale", label: "Make more like it" });
    expect(planDetail(a, p).whatToDo.join(" ")).toMatch(/new versions/);
  });

  it("never compares an ad with ads in another ad set", () => {
    // b1 has the same cost as a2 but no sibling: it isn't judged against a1.
    const p = ad("b1");
    expect(p.yardKind).not.toBe("others");
    expect(p.stance).not.toBe("cut");
  });

  it("names its ad set in 'Ads worth copying'", () => {
    const f = a.findings.find((x) => x.detector === "strong_performer");
    expect(f?.entityName).toBe("UGC video");
    expect(f?.whatHappened).toMatch(/the other ad in its ad set \(Broad audience\)/);
  });
});
