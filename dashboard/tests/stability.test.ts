import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/analyze";
import { computePlan } from "@/lib/analysis/plan";
import { alertDetails } from "@/lib/analysis/findingGroups";
import { resolveSelection, type Coverage } from "@/lib/analysis/periods";
import { roleFromName } from "@/lib/analysis/roles";
import { betterBy, direction } from "@/lib/analysis/stability";
import { addDays } from "@/lib/dates";
import { emptyMeasures, type Measures } from "@/lib/metrics/measures";
import type { Objective } from "@/lib/metrics/objectives";
import { generateClientRows, SAMPLE_ACCOUNT, SAMPLE_CLIENTS, type SampleClient } from "@/lib/sample/generate";
import type { AnalysisInput, CampaignInfo, FactRow } from "@/lib/analysis/types";

// v3 Phase 1 (docs/AdMate_MRD.md §16.3, FR-02/03/04/06/07): budget calls must be
// real and lasting, and every page must give a campaign the same advice.

const END = "2026-10-13";
const m = (x: Partial<Measures>): Measures => ({ ...emptyMeasures(), ...x });

// The sample generator's true rates are constant until a campaign's planted issue
// starts, so any High scale/cut before then is a reaction to noise.
function sampleData(client: SampleClient) {
  const campaigns: CampaignInfo[] = [];
  const lower: CampaignInfo[] = [];
  const all: FactRow[] = [];
  for (const [platform, rows] of generateClientRows(client, END)) {
    for (const r of rows) {
      let c = campaigns.find((x) => x.name === r.campaign);
      if (!c) {
        c = { id: `c${campaigns.length}`, name: r.campaign, platform, objective: r.objective, objectiveSource: "platform_objective", status: "active", secondaryStatus: null, budget: r.budget, firstSeen: addDays(END, -89), lastSeen: END };
        campaigns.push(c);
      }
      let s = lower.find((x) => x.level === "ad_group" && x.name === r.adGroup && x.campaignId === c!.id);
      if (!s) {
        s = { ...c, id: `s${lower.length}`, name: r.adGroup!, level: "ad_group", campaignId: c.id, parentName: c.name };
        lower.push(s);
      }
      let ad = lower.find((x) => x.level === "ad" && x.name === r.ad && x.campaignId === c!.id);
      if (!ad) {
        ad = { ...c, id: `a${lower.length}`, name: r.ad!, level: "ad", campaignId: c.id, parentName: s.name };
        lower.push(ad);
      }
      all.push({ campaignId: c.id, adGroupId: s.id, adId: ad.id, platform, granularity: "daily", periodStart: r.date!, periodEnd: r.date!, measures: r.measures });
    }
  }
  return { campaigns, lower, all };
}

function sampleInput(client: SampleClient, data: ReturnType<typeof sampleData>, end: string, params: Record<string, string> = {}): AnalysisInput {
  const coverage: Coverage = { hasData: true, hasDaily: true, minDate: addDays(END, -89), maxDate: end, dailyFrom: addDays(END, -89), dailyTo: end, snapshots: [], reports: [] };
  const selection = resolveSelection(params, coverage)!;
  const within = (f: FactRow, from: string, to: string) => f.periodStart >= from && f.periodEnd <= to;
  const all = data.all.filter((f) => f.periodEnd <= end);
  return {
    workspace: { id: "w", name: client.name, currency: "USD" },
    goals: client.goals.map((g) => ({ objective: g.objective, target: g.target ?? null, marginPct: g.marginPct ?? null, leadToCustomerPct: g.leadToCustomerPct ?? null, profitPerCustomer: g.profitPerCustomer ?? null })),
    campaigns: data.campaigns,
    entities: data.lower,
    coverage,
    selection,
    factsB: all.filter((f) => within(f, selection.b.from, selection.b.to)),
    factsA: selection.a ? all.filter((f) => within(f, selection.a!.from, selection.a!.to)) : [],
    recentDaily: all.filter((f) => within(f, addDays(selection.b.to, -27), selection.b.to)),
    factsHistory: all.filter((f) => f.periodEnd < selection.b.from),
    today: end,
  };
}

// The first day of a campaign's planted issue (null = none).
const issueStart = (client: SampleClient, name: string) => {
  const issue = client.campaigns.find((c) => c.name === name)?.issue;
  return issue ? addDays(END, -(issue.days - 1)) : null;
};

// High "put more money in" / "cut" calls on campaign-weeks where nothing really
// changed, over 8 weekly views of each sample account.
function noiseCalls(client: SampleClient): string[] {
  const data = sampleData(client);
  const calls: string[] = [];
  for (let w = 7; w >= 0; w--) {
    const end = addDays(END, -7 * w);
    for (const p of computePlan(analyze(sampleInput(client, data, end)))) {
      const start = issueStart(client, p.row.info.name);
      const noiseOnly = (!start || end < start) && client.campaigns.find((c) => c.name === p.row.info.name)?.issue?.kind !== "wasted";
      if (noiseOnly && p.priority === "high" && (p.stance === "scale" || p.stance === "cut")) calls.push(`${end} ${p.row.info.name}: ${p.stance}`);
    }
  }
  return calls;
}

describe("budget calls are confirmed before they're made (backtest on the sample)", () => {
  // v2 made 35 such calls over the 142 noise-only campaign-weeks (7 on Lotus).
  it("makes no noise-driven budget calls on the sample account users see", () => {
    expect(noiseCalls(SAMPLE_ACCOUNT)).toEqual([]);
  });

  it("makes at most a couple across all sample accounts (statistical outliers only)", () => {
    // The one left (Acme Dental, Sep 16–22) is a two-week run of 29 and 28 leads
    // against a usual ~44: p ≈ 0.001, indistinguishable from a real change.
    const all = [SAMPLE_ACCOUNT, ...SAMPLE_CLIENTS].flatMap(noiseCalls);
    expect(all.length).toBeLessThanOrEqual(2);
  });

  it("still finds every planted issue, at High, once it's there", () => {
    const data = sampleData(SAMPLE_ACCOUNT);
    const a = analyze(sampleInput(SAMPLE_ACCOUNT, data, END));
    const found = (detector: string, name: string) => a.findings.find((f) => f.detector === detector && f.campaignName === name);
    expect(found("tracking_break", "Leads | Skin quiz form")?.priority).toBe("high");
    expect(found("post_click_drop", "Sales | Website | Catalog")?.priority).toBe("high");
    expect(found("creative_fatigue", "Messages | Broad | Promo video")?.priority).toBe("high");
    expect(found("cpm_spike", "TT | Followers | Brand")?.bucket).toBe("attention");
  });

  it("makes no budget calls from a single day", () => {
    for (const client of [SAMPLE_ACCOUNT, ...SAMPLE_CLIENTS]) {
      const data = sampleData(client);
      for (let d = 20; d >= 7; d--) {
        const day = addDays(END, -d);
        const a = analyze(sampleInput(client, data, day, { from: day, to: day, cmp: "day", cfrom: addDays(day, -1) }));
        for (const p of computePlan(a)) expect.soft(["scale", "cut", "reuse", "avoid"], `${day} ${p.row.info.name}`).not.toContain(p.stance);
      }
    }
  });

  it("doesn't compare broad prospecting with retargeting (no weekly 'budget concentration' false alarm)", () => {
    const data = sampleData(SAMPLE_ACCOUNT);
    for (let w = 7; w >= 1; w--) {
      const a = analyze(sampleInput(SAMPLE_ACCOUNT, data, addDays(END, -7 * w)));
      expect(a.findings.some((f) => f.detector === "budget_concentration")).toBe(false);
    }
  });
});

describe("one campaign, one piece of advice, one priority (FR-02)", () => {
  for (const client of [SAMPLE_ACCOUNT, ...SAMPLE_CLIENTS]) {
    it(`${client.name}: a diagnosed problem decides the campaign's action and priority on every page`, () => {
      const data = sampleData(client);
      for (let w = 3; w >= 0; w--) {
        const a = analyze(sampleInput(client, data, addDays(END, -7 * w)));
        const plan = computePlan(a);
        const alerts = alertDetails(a, plan);
        for (const f of a.findings.filter((x) => x.bucket === "attention" && x.level === "campaign")) {
          const p = plan.find((x) => x.row.info.id === f.entityId)!;
          const budgetOnly = ["REDUCE_BUDGET", "PAUSE", "SHIFT_BUDGET"].includes(f.actionType);
          // Never "put more money in" next to a problem, never "cut" next to "hold" or "fix tracking".
          if (!budgetOnly) expect(p.stance, `${f.detector} on ${p.row.info.name}`).toBe("fix");
          expect(p.stance).not.toBe("scale");
          const shown = alerts.find((d) => d.key === f.key);
          if (shown) expect(shown.priority, `${f.detector} on ${p.row.info.name}`).toBe(p.priority);
        }
      }
    });
  }
});

describe("one definition of '20% better'", () => {
  it("matches the wording on the card", () => {
    // Cost per lead $4.10 vs $5.00: the card says "18% cheaper", so it is not "20% better".
    const pi = 5 / 4.1;
    expect(Math.round(betterBy(pi, "cost") * 100)).toBe(18);
    expect(direction(pi, "cost")).toBeNull();
    expect(direction(5 / 4, "cost")).toBe("better"); // 20% cheaper
    expect(direction(5 / 6, "cost")).toBe("worse"); // 20% more expensive
    expect(direction(1.2, "roas")).toBe("better");
    expect(direction(0.8, "roas")).toBe("worse");
  });
});

// ---- hand-built daily data ----
interface Day {
  spend: number;
  impressions: number;
  linkClicks: number;
  leads?: number;
  purchases?: number;
  conversionValue?: number;
}
function dailyInput(objective: Objective, days: Day[], opts: { name?: string; target?: number; uploadedAt?: string; maturityDays?: number } = {}): AnalysisInput {
  const end = addDays("2026-09-01", days.length - 1);
  const c: CampaignInfo = { id: "c", name: opts.name ?? "Prospecting | Broad", platform: "meta", objective, objectiveSource: "result_type", status: "active", secondaryStatus: null, budget: 100, firstSeen: "2026-09-01", lastSeen: end };
  const facts: FactRow[] = days.map((d, i) => {
    const date = addDays("2026-09-01", i);
    return { importId: "imp", campaignId: "c", platform: "meta", granularity: "daily", periodStart: date, periodEnd: date, measures: m(d) };
  });
  const coverage: Coverage = {
    hasData: true, hasDaily: true, minDate: "2026-09-01", maxDate: end, dailyFrom: "2026-09-01", dailyTo: end, snapshots: [],
    reports: [{ importId: "imp", platform: "meta", from: "2026-09-01", to: end, fileName: "x.csv", granularity: "daily", uploadedAt: opts.uploadedAt ?? addDays(end, 10) }],
  };
  const selection = resolveSelection({}, coverage)!;
  const within = (f: FactRow, from: string, to: string) => f.periodStart >= from && f.periodEnd <= to;
  return {
    workspace: { id: "w", name: "T", currency: "USD" },
    goals: opts.target ? [{ objective, target: opts.target, marginPct: null, leadToCustomerPct: null, profitPerCustomer: null }] : [],
    campaigns: [c], coverage, selection,
    factsB: facts.filter((f) => within(f, selection.b.from, selection.b.to)),
    factsA: selection.a ? facts.filter((f) => within(f, selection.a!.from, selection.a!.to)) : [],
    recentDaily: facts.filter((f) => within(f, addDays(selection.b.to, -27), selection.b.to)),
    factsHistory: facts.filter((f) => f.periodEnd < selection.b.from),
    today: end,
    maturityDays: opts.maturityDays,
  };
}
const leadsDay = (leads: number, spend = 100): Day => ({ spend, impressions: 50_000, linkClicks: 600, leads });

describe("past-first judging with a target-gap warning", () => {
  it("still says 'put more money in' when it clearly beat its past, but shows it's off target", () => {
    // CPL $2.00 for four weeks, then $1.00 for a week; target $0.50.
    const days = [...Array.from({ length: 28 }, () => leadsDay(50)), ...Array.from({ length: 7 }, () => leadsDay(100))];
    const a = analyze(dailyInput("leads", days, { target: 0.5 }));
    const p = computePlan(a)[0];
    expect(p).toMatchObject({ stance: "scale", priority: "high" });
    expect(p.targetGap).toBeCloseTo(1, 6); // $1.00 is 100% more expensive than $0.50
    expect(p.why).toMatch(/not yet on target/);
  });

  it("watches instead of acting when only the previous week was unusual", () => {
    // Steady at $2.00, one bad week at $4.00, then back to $2.00: "50% cheaper than last week" is a blip.
    const days = [...Array.from({ length: 21 }, () => leadsDay(50)), ...Array.from({ length: 7 }, () => leadsDay(25)), ...Array.from({ length: 7 }, () => leadsDay(50))];
    const p = computePlan(analyze(dailyInput("leads", days)))[0];
    expect(p.stance).toBe("watch");
    expect(p.pending).toBe("scale");
    expect(p.unconfirmed).toMatch(/older results/);
  });
});

describe("recent days whose conversions may still grow (FR-04)", () => {
  // Steady 100 leads a day; the last 3 days (uploaded the next day) show 40.
  const days = [...Array.from({ length: 32 }, () => leadsDay(100)), ...Array.from({ length: 3 }, () => leadsDay(40))];
  const end = addDays("2026-09-01", days.length - 1);

  it("doesn't call a drop that sits only in the immature days", () => {
    const a = analyze(dailyInput("leads", days, { uploadedAt: addDays(end, 1) }));
    const p = computePlan(a)[0];
    expect(p.stance).toBe("watch");
    expect(p.unconfirmed).toMatch(/last few days/);
    expect(a.findings.filter((f) => f.detector === "kpi_worsened").every((f) => f.bucket === "monitor")).toBe(true);
    expect(a.dataNotes.some((n) => n.key === "immature")).toBe(true);
  });

  it("does call it once the days are mature (uploaded well after)", () => {
    const a = analyze(dailyInput("leads", days, { uploadedAt: addDays(end, 10) }));
    expect(computePlan(a)[0].stance).not.toBe("watch");
    expect(a.dataNotes.some((n) => n.key === "immature")).toBe(false);
  });
});

describe("data checks (FR-06)", () => {
  it("flags revenue that stopped being recorded while purchases continue", () => {
    const sale = (purchases: number, value: number): Day => ({ spend: 200, impressions: 40_000, linkClicks: 500, purchases, conversionValue: value });
    const days = [...Array.from({ length: 28 }, () => sale(10, 600)), ...Array.from({ length: 7 }, () => sale(10, 0))];
    const a = analyze(dailyInput("sales", days));
    const f = a.findings.find((x) => x.detector === "revenue_break");
    expect(f?.priority).toBe("high");
    expect(f?.actionType).toBe("FIX_TRACKING");
    expect(computePlan(a)[0]).toMatchObject({ stance: "fix", priority: "high" });
  });

  it("notes when leads come from the generic Conversions column", () => {
    const days = Array.from({ length: 14 }, () => ({ spend: 100, impressions: 50_000, linkClicks: 600, conversions: 40 }) as Day);
    const a = analyze(dailyInput("leads", days));
    expect(a.dataNotes.some((n) => n.key === "generic:leads")).toBe(true);
  });
});

describe("funnel roles (FR-07)", () => {
  it("recognises common naming conventions", () => {
    expect(roleFromName("Messages | Retargeting 30d")).toBe("retargeting");
    expect(roleFromName("RT | ATC 14d")).toBe("retargeting");
    expect(roleFromName("Website visitors - remarketing")).toBe("retargeting");
    expect(roleFromName("Existing customers | upsell")).toBe("existing");
    expect(roleFromName("Search | Branded terms")).toBe("brand");
    expect(roleFromName("Messages | Broad | Promo video")).toBeNull();
    expect(roleFromName("UGC 3D video hook")).toBeNull();
  });

  it("lets the user's choice win over the name", () => {
    const days = Array.from({ length: 14 }, () => leadsDay(50));
    const input = dailyInput("leads", days, { name: "Retargeting 30d" });
    expect(analyze(input).campaigns[0].role).toBe("retargeting");
    input.campaigns[0].role = "prospecting";
    expect(analyze(input).campaigns[0]).toMatchObject({ role: "prospecting", roleSource: "user" });
  });
});
