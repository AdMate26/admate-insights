import type { AnalysisInput, CampaignInfo, FactRow } from "@/lib/analysis/types";
import { resolveSelection, type Coverage } from "@/lib/analysis/periods";
import { addDays } from "@/lib/dates";
import { generateClientRows, type SampleClient } from "@/lib/sample/generate";

export const END = "2026-09-28";

// Analysis input for a sample client, with campaign, ad set and ad entities.
export function inputFor(client: SampleClient, params = {}, withLevels = false): AnalysisInput {
  const byPlatform = generateClientRows(client, END);
  const campaigns: CampaignInfo[] = [];
  const lower: CampaignInfo[] = [];
  const all: FactRow[] = [];
  for (const [platform, rows] of byPlatform) {
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
      all.push({ campaignId: c.id, adGroupId: withLevels ? s.id : null, adId: withLevels ? ad.id : null, platform, granularity: "daily", periodStart: r.date!, periodEnd: r.date!, measures: r.measures });
    }
  }
  const coverage: Coverage = { hasData: true, hasDaily: true, minDate: addDays(END, -89), maxDate: END, dailyFrom: addDays(END, -89), dailyTo: END, snapshots: [], reports: [] };
  const selection = resolveSelection(params, coverage)!;
  const within = (f: FactRow, from: string, to: string) => f.periodStart >= from && f.periodEnd <= to;
  return {
    workspace: { id: "w", name: client.name, currency: "USD" },
    goals: client.goals.map((g) => ({ objective: g.objective, target: g.target ?? null, marginPct: g.marginPct ?? null, leadToCustomerPct: g.leadToCustomerPct ?? null, profitPerCustomer: g.profitPerCustomer ?? null })),
    campaigns,
    entities: withLevels ? lower : [],
    coverage,
    selection,
    factsB: all.filter((f) => within(f, selection.b.from, selection.b.to)),
    factsA: selection.a ? all.filter((f) => within(f, selection.a!.from, selection.a!.to)) : [],
    recentDaily: all.filter((f) => within(f, addDays(selection.b.to, -27), selection.b.to)),
    factsHistory: all.filter((f) => f.periodEnd < selection.b.from),
    today: END,
  };
}

