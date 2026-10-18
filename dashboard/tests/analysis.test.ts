import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { normalizeTable } from "@/lib/ingest/normalize";
import { analyze } from "@/lib/analysis/analyze";
import { computePlan } from "@/lib/analysis/plan";
import { planDetail } from "@/lib/analysis/detail";
import { alertDetails, badgeCounts } from "@/lib/analysis/findingGroups";
import { decompose } from "@/lib/analysis/decompose";
import { explainEmpty, presets, previousRange, resolveSelection, type Coverage } from "@/lib/analysis/periods";
import { changeConfidence, twoProportionP } from "@/lib/analysis/stats";
import type { AnalysisInput, CampaignInfo, FactRow } from "@/lib/analysis/types";
import { emptyMeasures, MEASURE_KEYS, type MeasureKey, type Measures } from "@/lib/metrics/measures";
import type { Objective } from "@/lib/metrics/objectives";
import { SAMPLE_ACCOUNT, SAMPLE_CLIENTS, type SampleClient } from "@/lib/sample/generate";

import { END, inputFor } from "./helpers";

const m = (x: Partial<Measures>): Measures => ({ ...emptyMeasures(), ...x });
const camp = (id: string, objective: Objective, name = id): CampaignInfo => ({
  id, name, platform: "meta", objective, objectiveSource: "result_type", status: "active", secondaryStatus: null, budget: null, firstSeen: "2026-01-01", lastSeen: "2026-03-31",
});
const snapCoverage: Coverage = { hasData: true, hasDaily: false, minDate: "2026-03-01", maxDate: "2026-03-31", dailyFrom: null, dailyTo: null, snapshots: [], reports: [] };
function snapshotInput(campaigns: CampaignInfo[], measures: Record<string, Measures>, columns?: MeasureKey[]): AnalysisInput {
  const facts: FactRow[] = campaigns.map((c) => ({ importId: "imp", campaignId: c.id, platform: "meta", granularity: "snapshot", periodStart: "2026-03-01", periodEnd: "2026-03-31", measures: measures[c.id] }));
  return {
    workspace: { id: "w", name: "Test", currency: "USD" }, goals: [], campaigns, coverage: snapCoverage,
    selection: resolveSelection({ from: "2026-03-01", to: "2026-03-31", cmp: "none" }, snapCoverage)!,
    factsB: facts, factsA: [], recentDaily: [], today: "2026-04-02",
    columns: columns ? new Map([["imp", new Set(columns)]]) : undefined,
  };
}

describe("periods", () => {
  it("compares whole months with the previous whole month", () => {
    expect(previousRange({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("compares 7 days with the 7 days before (weekday-aligned)", () => {
    expect(previousRange({ from: "2026-09-22", to: "2026-09-28" })).toEqual({ from: "2026-09-15", to: "2026-09-21" });
  });
  it("defaults day-vs-day to the same weekday last week", () => {
    const cov: Coverage = { hasData: true, hasDaily: true, minDate: "2026-07-01", maxDate: END, dailyFrom: "2026-07-01", dailyTo: END, snapshots: [], reports: [] };
    const s = resolveSelection({ from: END, to: END, cmp: "day" }, cov)!;
    expect(s.a).toEqual({ from: "2026-09-21", to: "2026-09-21" });
  });
});

describe("period uploads (no daily breakdown)", () => {
  const snapshots = [
    { importId: "t", platform: "tiktok", from: "2026-08-01", to: "2026-08-31", fileName: "tt.xlsx" },
    { importId: "j", platform: "meta", from: "2026-07-01", to: "2026-07-31", fileName: "jul.csv" },
    { importId: "m", platform: "meta", from: "2026-03-01", to: "2026-03-31", fileName: "mar.xlsx" },
  ];
  const cov: Coverage = {
    hasData: true, hasDaily: false, minDate: "2026-03-01", maxDate: "2026-08-31", dailyFrom: null, dailyTo: null,
    snapshots,
    reports: snapshots.map((s) => ({ ...s, granularity: "snapshot" as const })),
  };

  it("explains that a single day inside a monthly upload can't be shown", () => {
    const e = explainEmpty({ from: "2026-07-10", to: "2026-07-10" }, cov, "period");
    expect(e.message).toContain("only has totals for the whole period");
    expect(e.suggestions[0].params).toEqual({ report: "j" });
  });

  it("defaults to the newest report vs the previous report of the same platform", () => {
    const s = resolveSelection({}, cov)!;
    expect(s.mode).toBe("reports");
    expect(s.reports!.b.importId).toBe("t");
    expect(s.reports!.a!.importId).toBe("j");
  });

  it("compares any two reports the user picks, in the order they chose", () => {
    const s = resolveSelection({ report: "j", vs: "m" }, cov)!;
    expect(s.reports!.b.importId).toBe("j");
    expect(s.reports!.a!.importId).toBe("m");
    expect(resolveSelection({ report: "t", vs: "j" }, cov)!.compareLabel).toBe("Jul 1–31 (Meta)");
  });

  it("offers no day-based quick picks without daily data", () => {
    expect(presets(cov).some((p) => p.params.cmp === "day")).toBe(false);
  });
});

describe("stats", () => {
  it("flags a real rate change and ignores noise", () => {
    expect(twoProportionP(100, 10000, 60, 10000)).toBeLessThan(0.05);
    expect(twoProportionP(10, 1000, 9, 1000)).toBeGreaterThan(0.5);
  });
  it("gives low confidence to tiny volumes", () => {
    const a = m({ spend: 50, impressions: 5000, linkClicks: 50, leads: 5 });
    const b = m({ spend: 50, impressions: 5000, linkClicks: 50, leads: 3 });
    expect(changeConfidence("leads", "cost", a, b)).toBe("low");
  });
});

describe("decomposition", () => {
  it("driver shares add up to 100% of the KPI change, and display weights never exceed 100%", () => {
    const a = m({ spend: 1000, impressions: 100000, linkClicks: 1200, leads: 60 });
    const b = m({ spend: 700, impressions: 100000, linkClicks: 900, leads: 50 }); // CPM helped, CTR hurt
    const d = decompose("leads", "cost", a, b)!;
    expect(d.drivers.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 6);
    expect(d.drivers.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 6);
    for (const x of d.drivers) expect(x.weight).toBeLessThanOrEqual(1);
    expect(d.kpiChange).toBeCloseTo(700 / 50 / (1000 / 60) - 1, 6);
  });
});

describe("data reliability", () => {
  it("never reads a missing results column as zero results", () => {
    const campaigns = [camp("x", "leads", "Lead form")];
    const measures = { x: m({ spend: 500, impressions: 50000, linkClicks: 600 }) };
    // The export had no leads/conversions column at all.
    const a = analyze(snapshotInput(campaigns, measures, ["spend", "impressions", "linkClicks", "reach"]));
    expect(a.findings.some((f) => f.detector === "wasted_spend")).toBe(false);
    expect(a.campaigns[0].verdict).toBe("no_data");
    expect(a.dataNotes.some((n) => n.key === "missing:leads")).toBe(true);
    expect(a.goalStatus[0].state).toBe("unknown");
  });

  it("does flag real zero results when the column exists", () => {
    const campaigns = [camp("x", "leads", "Lead form"), camp("y", "leads", "Lead retarget"), camp("z", "leads", "Lead LAL")];
    const measures = {
      x: m({ spend: 500, impressions: 50000, linkClicks: 600, leads: 0 }),
      y: m({ spend: 400, impressions: 40000, linkClicks: 500, leads: 40 }),
      z: m({ spend: 300, impressions: 30000, linkClicks: 400, leads: 30 }),
    };
    const a = analyze(snapshotInput(campaigns, measures, ["spend", "impressions", "linkClicks", "leads"]));
    const wasted = a.findings.find((f) => f.detector === "wasted_spend");
    expect(wasted?.entityName).toBe("Lead form");
    expect(wasted?.priority).toBe("high");
    expect(wasted?.moneyAtStake).toBe(500);
  });

  it("doesn't add reach across days: daily awareness is judged by CPM", () => {
    const client: SampleClient = { name: "Aw", industry: "x", currency: "USD", goals: [], campaigns: [{ name: "Awareness | Brand", platform: "meta", objective: "awareness", dailySpend: 30, cpm: 3, ctr: 0.004, cvr: 0 }] };
    const a = analyze(inputFor(client));
    const aw = a.objectives.find((o) => o.objective === "awareness")!;
    expect(aw.mode).toBe("cpm");
    expect(aw.supporting.find((s) => s.key === "frequency")!.missing).toBe(true);
    expect(a.dataNotes.some((n) => n.key === "reach:cpm")).toBe(true);
  });

  it("uses reach from a single period row, but not across periods of different length", () => {
    const campaigns = [camp("x", "awareness")];
    const single = analyze(snapshotInput(campaigns, { x: m({ spend: 100, impressions: 60000, reach: 30000 }) }));
    expect(single.objectives[0].mode).toBe("cost");
    expect(single.objectives[0].kpiB).toBeCloseTo((100 / 30000) * 1000, 6);

    // A 5-day report compared with a 31-day report: reach can't be compared.
    const cov: Coverage = {
      hasData: true, hasDaily: false, minDate: "2026-08-01", maxDate: "2026-09-30", dailyFrom: null, dailyTo: null,
      snapshots: [{ importId: "sep", platform: "tiktok", from: "2026-09-26", to: "2026-09-30", fileName: "sep.xlsx" }, { importId: "aug", platform: "tiktok", from: "2026-08-01", to: "2026-08-31", fileName: "aug.xlsx" }],
      reports: [
        { importId: "sep", platform: "tiktok", from: "2026-09-26", to: "2026-09-30", fileName: "sep.xlsx", granularity: "snapshot" },
        { importId: "aug", platform: "tiktok", from: "2026-08-01", to: "2026-08-31", fileName: "aug.xlsx", granularity: "snapshot" },
      ],
    };
    const fact = (importId: string, from: string, to: string, x: Measures): FactRow => ({ importId, campaignId: "x", platform: "tiktok", granularity: "snapshot", periodStart: from, periodEnd: to, measures: x });
    const a = analyze({
      workspace: { id: "w", name: "T", currency: "USD" }, goals: [], campaigns: [{ ...camp("x", "awareness"), platform: "tiktok" }], coverage: cov,
      selection: resolveSelection({ report: "sep", vs: "aug" }, cov)!,
      factsB: [fact("sep", "2026-09-26", "2026-09-30", m({ spend: 7.27, impressions: 76000, reach: 48500 }))],
      factsA: [fact("aug", "2026-08-01", "2026-08-31", m({ spend: 80, impressions: 590000, reach: 173000 }))],
      recentDaily: [], today: "2026-10-01",
    });
    const aw = a.objectives[0];
    expect(aw.mode).toBe("cpm"); // compared by CPM, not by a misleading reach-based KPI
    expect(aw.change).toBeCloseTo(((7.27 / 76000) / (80 / 590000)) - 1, 6);
    expect(a.dataNotes.some((n) => n.key === "lengths")).toBe(true);
  });

  it("flags an objective that got worse even when each month runs different campaigns", () => {
    const cov: Coverage = {
      hasData: true, hasDaily: false, minDate: "2026-08-01", maxDate: "2026-09-30", dailyFrom: null, dailyTo: null, snapshots: [],
      reports: [
        { importId: "sep", platform: "tiktok", from: "2026-09-01", to: "2026-09-30", fileName: "sep.xlsx", granularity: "snapshot" },
        { importId: "aug", platform: "tiktok", from: "2026-08-01", to: "2026-08-31", fileName: "aug.xlsx", granularity: "snapshot" },
      ],
    };
    const sepC = { ...camp("s", "followers", "Followers Sep"), platform: "tiktok" as const, status: "completed" };
    const augC = { ...camp("g", "followers", "Followers Aug"), platform: "tiktok" as const, status: "completed" };
    const a = analyze({
      workspace: { id: "w", name: "T", currency: "USD" }, goals: [], campaigns: [sepC, augC], coverage: cov,
      selection: resolveSelection({ report: "sep", vs: "aug" }, cov)!,
      factsB: [{ importId: "sep", campaignId: "s", platform: "tiktok", granularity: "snapshot", periodStart: "2026-09-01", periodEnd: "2026-09-30", measures: m({ spend: 60, impressions: 150000, follows: 2000 }) }],
      factsA: [{ importId: "aug", campaignId: "g", platform: "tiktok", granularity: "snapshot", periodStart: "2026-08-01", periodEnd: "2026-08-31", measures: m({ spend: 62, impressions: 150000, follows: 3100 }) }],
      recentDaily: [], today: "2026-10-01",
    });
    const f = a.findings.find((x) => x.detector === "kpi_worsened");
    expect(f?.level).toBe("account");
    expect(f?.bucket).toBe("attention");
    expect(f?.related.join(" ")).toContain("Followers Sep");
  });

  it("only compares with 'similar campaigns' when there are at least 2 others", () => {
    const two = analyze(snapshotInput([camp("x", "leads"), camp("y", "leads")], { x: m({ spend: 100, impressions: 10000, linkClicks: 100, leads: 20 }), y: m({ spend: 100, impressions: 10000, linkClicks: 100, leads: 5 }) }));
    expect(two.campaigns.every((r) => r.peerKpi === null)).toBe(true);
    const three = analyze(snapshotInput([camp("x", "leads"), camp("y", "leads"), camp("z", "leads")], {
      x: m({ spend: 100, impressions: 10000, linkClicks: 100, leads: 20 }),
      y: m({ spend: 100, impressions: 10000, linkClicks: 100, leads: 5 }),
      z: m({ spend: 100, impressions: 10000, linkClicks: 100, leads: 10 }),
    }));
    const x = three.campaigns.find((r) => r.info.id === "x")!;
    expect(x.peerKpi).toBeCloseTo(200 / 15, 6); // the other two only
  });
});

const META = "fixtures/private/Cam-He-Campaigns-Mar-1-2026-Mar-31-2026.xlsx";

describe.skipIf(!existsSync(META))("real Meta export (ended campaigns)", () => {
  it("turns an ended month into lessons for the next flight, and says it has no target or history", () => {
    const p = normalizeTable(readFileSync(META), "Cam-He-Campaigns-Mar-1-2026-Mar-31-2026.xlsx");
    const campaigns: CampaignInfo[] = p.rows.map((r, i) => ({
      id: `m${i}`, name: r.campaign, platform: "meta", objective: r.objective, objectiveSource: r.objectiveSource,
      status: r.status, secondaryStatus: null, budget: null, firstSeen: "2026-03-01", lastSeen: "2026-03-31",
    }));
    const facts: FactRow[] = p.rows.map((r, i) => ({ importId: "imp", campaignId: `m${i}`, platform: "meta", granularity: "snapshot", periodStart: "2026-03-01", periodEnd: "2026-03-31", measures: r.measures }));
    const a = analyze({
      workspace: { id: "w", name: "Mary May", currency: "USD" }, goals: [], campaigns, coverage: snapCoverage,
      selection: resolveSelection({ from: "2026-03-01", to: "2026-03-31" }, snapCoverage)!, factsB: facts, factsA: [], recentDaily: [],
      columns: new Map([["imp", new Set(p.measuresPresent)]]), today: "2026-04-05",
    });
    const found = a.findings.map((f) => `${f.detector}:${f.entityName}`);
    expect(found).toContain("lesson_winner:MA-awareness-Broad Audience");
    expect(found).toContain("lesson_underperformer:MM-awareness-Interest Base Set 1");
    expect(a.goalStatus.every((g) => g.basis === "within_account" || g.basis === "none")).toBe(true);
  });
});

describe("planted issues in the sample accounts", () => {
  it("Acme Dental: finds the Meta tracking break first and the wasted Google spend", () => {
    const a = analyze(inputFor(SAMPLE_CLIENTS[0]));
    expect(a.findings[0].detector).toBe("tracking_break");
    expect(a.findings[0].entityName).toBe("Leads | Broad | Whitening offer");
    expect(a.findings[0].priority).toBe("high");
    expect(a.findings.some((f) => f.detector === "wasted_spend" && f.entityName === "Search | Emergency dentist")).toBe(true);
    expect(a.dataNotes.some((n) => n.key === "partial_day")).toBe(false);
  });

  it("Bloom Co: finds creative fatigue, the CPM spike and the post-click drop", () => {
    const a = analyze(inputFor(SAMPLE_CLIENTS[1]));
    const found = a.findings.map((f) => `${f.detector}:${f.entityName}`);
    expect(found).toContain("creative_fatigue:Sales | ASC | UGC v3");
    expect(found).toContain("cpm_spike:Spark Ads | Creator bundle");
    expect(found).toContain("post_click_drop:PMax | All products");
    expect(a.objectives.find((o) => o.objective === "sales")!.mode).toBe("roas");
  });

  it("Lotus Skincare (the sample account): every planted issue, the winner, and a no-target goal status", () => {
    const a = analyze(inputFor(SAMPLE_ACCOUNT, {}, true));
    const found = a.findings.map((f) => `${f.detector}:${f.entityName}`);
    expect(found).toContain("tracking_break:Leads | Skin quiz form");
    expect(found).toContain("creative_fatigue:Messages | Broad | Promo video");
    expect(found).toContain("post_click_drop:Sales | Website | Catalog");
    expect(found).toContain("cpm_spike:TT | Followers | Brand");
    expect(found).toContain("budget_winner:Messages | Retargeting 30d");
    // The fatigue finding names the ads whose CTR fell most, instead of separate cards.
    const fatigue = a.findings.find((f) => f.detector === "creative_fatigue")!;
    expect(fatigue.related.some((r) => r.includes("CTR"))).toBe(true);
    expect(a.findings.some((f) => f.detector === "ad_ctr_drop" && f.campaignName === "Messages | Broad | Promo video")).toBe(false);
    // Leads has no target → compared with the previous period, and a target is suggested.
    const leads = a.goalStatus.find((g) => g.objective === "leads")!;
    expect(leads.basis).toBe("previous");
    expect(leads.suggestedTarget).not.toBeNull();
    expect(a.goalStatus.find((g) => g.objective === "messages")!.basis).toBe("target");
  });

  it("puts every finding in one bucket with a priority, data basis and money at stake", () => {
    const a = analyze(inputFor(SAMPLE_ACCOUNT, {}, true));
    for (const f of a.findings) {
      expect(["attention", "opportunity", "monitor"]).toContain(f.bucket);
      expect(f.priorityReason.length).toBeGreaterThan(10);
      expect(f.rule.length).toBeGreaterThan(10);
      expect(f.dataBasis).toMatch(/day/);
      expect(f.moneyAtStake).toBeGreaterThanOrEqual(0);
      expect((f.bucket === "monitor") === (f.priority === "monitor")).toBe(true);
    }
    // Extra cost is plain arithmetic on the item's own numbers.
    const fatigue = a.findings.find((f) => f.detector === "creative_fatigue")!;
    const row = a.campaigns.find((r) => r.info.name === "Messages | Broad | Promo video")!;
    expect(fatigue.extraCost!.amount).toBeCloseTo(row.b.messages * (row.kpiB! - row.kpiA!), 6);
  });

  it("never gives pause/scale advice on low confidence", () => {
    for (const client of [...SAMPLE_CLIENTS, SAMPLE_ACCOUNT]) {
      const a = analyze(inputFor(client, { from: END, to: END, cmp: "day" }));
      for (const f of a.findings) {
        if (f.confidence === "low") expect(["WATCH", "FIX_TRACKING", "CHECK_DELIVERY"]).toContain(f.actionType);
      }
    }
  });

  it("finds the strongest ad and says what to reuse", () => {
    const a = analyze(inputFor(SAMPLE_CLIENTS[1], {}, true));
    const strong = a.findings.filter((f) => f.detector === "strong_performer");
    for (const f of strong) {
      expect(f.bucket === "opportunity" || f.bucket === "monitor").toBe(true);
      expect(f.action).toMatch(/Reuse|Keep/);
    }
  });
});

describe("column availability helpers", () => {
  it("treats every measure as present when nothing is known", () => {
    const a = analyze(snapshotInput([camp("x", "leads")], { x: m({ spend: 100, impressions: 10000, linkClicks: 100, leads: 10 }) }));
    expect(MEASURE_KEYS.every((k) => a.campaigns[0].availB.has(k))).toBe(true);
  });
});

describe("action plan (works without a comparison period)", () => {
  it("gives every campaign a priority: scale/cut = high, on par = medium, little data or learning = low", () => {
    const campaigns = [camp("win", "leads", "Winner"), camp("avg", "leads", "Average"), camp("bad", "leads", "Weak"), camp("tiny", "leads", "Tiny"), { ...camp("new", "leads", "Learning one"), status: "learning" }];
    const a = analyze(
      snapshotInput(campaigns, {
        win: m({ spend: 100, impressions: 20000, linkClicks: 300, leads: 50 }), // $2.00
        avg: m({ spend: 300, impressions: 60000, linkClicks: 600, leads: 75 }), // $4.00
        bad: m({ spend: 300, impressions: 60000, linkClicks: 500, leads: 40 }), // $7.50
        tiny: m({ spend: 20, impressions: 3000, linkClicks: 30, leads: 3 }),
        new: m({ spend: 50, impressions: 8000, linkClicks: 90, leads: 12 }),
      }),
    );
    const plan = computePlan(a);
    const by = (name: string) => plan.find((p) => p.row.info.name === name)!;
    expect(plan).toHaveLength(5);
    expect(by("Winner")).toMatchObject({ priority: "high", stance: "scale" });
    expect(by("Weak")).toMatchObject({ priority: "high", stance: "cut" });
    expect(by("Average")).toMatchObject({ priority: "medium", stance: "keep" });
    expect(by("Tiny")).toMatchObject({ priority: "low", stance: "wait" });
    expect(by("Learning one")).toMatchObject({ priority: "low", stance: "learn" });
    expect(by("Winner").yardstick).toContain("other lead generation campaigns");
    expect(by("Winner").why).toMatch(/cheaper/);
    expect(plan[0].priority).toBe("high");
  });

  it("judges against its own past results first, then the target", () => {
    const a = analyze(inputFor(SAMPLE_ACCOUNT, {}, true));
    const plan = computePlan(a);
    const retarget = plan.find((p) => p.row.info.name === "Messages | Retargeting 30d")!;
    // With a comparison period: judged against its own previous week, where it held steady.
    expect(retarget.yardKind).toBe("previous");
    expect(retarget).toMatchObject({ stance: "keep", priority: "medium" });
    expect(planDetail(a, retarget).note).toBeNull();
    const leads = plan.find((p) => p.row.info.name === "Leads | Skin quiz form")!;
    expect(leads).toMatchObject({ priority: "high", stance: "fix" });
    expect(leads.action).toMatch(/Test a lead/);

    // No comparison selected: everything uploaded before the period is its past.
    const noCmp = analyze(inputFor(SAMPLE_ACCOUNT, { from: "2026-09-22", to: "2026-09-28", cmp: "none" }, true));
    const r2 = computePlan(noCmp).find((p) => p.row.info.name === "Messages | Retargeting 30d")!;
    expect(r2.yardKind).toBe("history");
    expect(r2.yardstick).toContain("its own past results");
  });

  it("with no past results, uses the target and explains the evaluation order in a small note", () => {
    const input = snapshotInput([camp("x", "leads", "Only one")], { x: m({ spend: 300, impressions: 60000, linkClicks: 600, leads: 60 }) });
    input.goals = [{ objective: "leads", target: 4, marginPct: null, leadToCustomerPct: null, profitPerCustomer: null }];
    const a = analyze(input);
    const p = computePlan(a)[0];
    expect(p.yardKind).toBe("target");
    const d = planDetail(a, p);
    expect(d.note).toMatch(/No past results/);
    expect(d.note).toMatch(/industry benchmarks for Cambodia/);
    expect(d.note).not.toMatch(/$d/); // no invented benchmark numbers
  });
});

describe("alerts and detailed cards agree with the plan", () => {
  const campaigns = [camp("win", "leads", "Winner"), camp("avg", "leads", "Average"), camp("bad", "leads", "Weak")];
  const measures = {
    win: m({ spend: 100, impressions: 20000, linkClicks: 300, leads: 50 }),
    avg: m({ spend: 300, impressions: 60000, linkClicks: 600, leads: 75 }),
    bad: m({ spend: 300, impressions: 60000, linkClicks: 500, leads: 40 }),
  };

  it("shows campaigns clearly worse than expected as alerts, without a comparison period", () => {
    const a = analyze(snapshotInput(campaigns, measures));
    expect(a.hasComparisonData).toBe(false);
    const list = alertDetails(a);
    expect(list.some((d) => d.where === "Weak" && d.kind === "issue")).toBe(true);
    expect(badgeCounts(a).alerts).toBe(list.length);
  });

  it("builds the full description: why, what to do, what to monitor, limits, confidence, how it was judged", () => {
    const a = analyze(snapshotInput(campaigns, measures));
    const weak = computePlan(a).find((p) => p.row.info.name === "Weak")!;
    const d = planDetail(a, weak);
    expect(d.title).toMatch(/more expensive than your other lead generation campaigns/);
    expect(d.tiles.map((t) => t.label)).toEqual(["Spend", "leads", "Cost per lead", "Clicks", "Share of account spend"]);
    expect(d.whyHappening.length).toBeGreaterThan(0);
    expect(d.whatToDo.length).toBe(3);
    expect(d.monitor.length).toBeGreaterThan(0);
    expect(d.cantTell.some((c) => c.includes("no earlier period"))).toBe(true);
    expect(d.judgedBy[0]).toMatch(/Objective: Lead generation/);
    // The Campaigns table shows the same assessment, so "high priority" and "on track" can't disagree.
    expect(weak.assessment).toBe("Worse than expected");
  });
});
