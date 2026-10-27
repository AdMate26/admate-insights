import { describe, expect, it, vi } from "vitest";

// The assistant's tools are server code; run them here without the database.
vi.mock("server-only", () => ({}));
// As the sample account: its location split is simulated from its totals, no database.
vi.mock("@/lib/data/workspaces", () => ({ loadFacts: async () => [], loadBreakdowns: async () => ({ rows: [], inPeriod: false }), getWorkspace: async () => ({ isSample: true }) }));

import { analyze } from "@/lib/analysis/analyze";
import { runTool, TOOL_DEFS } from "@/lib/ai/tools";
import { unmatchedNumbers } from "@/lib/ai/validator";
import { managerSummaryFacts, managerSummaryText } from "@/lib/analysis/managerSummary";
import { SAMPLE_ACCOUNT } from "@/lib/sample/generate";
import { inputFor } from "./helpers";

const a = analyze(inputFor(SAMPLE_ACCOUNT, {}, true));

describe("assistant tools (read-only, engine numbers only)", () => {
  it("every declared tool runs and returns JSON", async () => {
    const campaign = a.campaigns[0].info.id;
    const inputs: Record<string, unknown> = {
      get_overview: {},
      list_findings: { bucket: "attention" },
      get_finding: { id: a.findings[0].key },
      find_items: { level: "ad", sort: "worst_performer", limit: 5 },
      get_item: { level: "campaign", id: campaign },
      compare_items: { level: "campaign", id_a: a.campaigns[0].info.id, id_b: a.campaigns[1].info.id },
      get_daily: { objective: "messages" },
      get_locations: {},
    };
    for (const t of TOOL_DEFS) {
      const r = await runTool(a, t.name, inputs[t.name]);
      expect(r.isError, `${t.name}: ${r.content}`).toBe(false);
      expect(() => JSON.parse(r.content)).not.toThrow();
    }
  });

  it("returns the finding's evidence and says what is missing instead of zero", async () => {
    const f = JSON.parse((await runTool(a, "get_finding", { id: a.findings[0].key })).content);
    expect(f.evidence.length).toBeGreaterThan(0);
    expect(f.based_on).toMatch(/days/);
    const item = JSON.parse((await runTool(a, "get_item", { level: "campaign", id: a.campaigns[0].info.id })).content);
    // Daily rows: reach can't be added up, so frequency is reported as missing, not computed.
    expect(item.metrics["Freq."]).toBe("not in export");
  });

  it("locations: spend by place for all campaigns, results per goal, and says the sample split is simulated", async () => {
    const g = JSON.parse((await runTool(a, "get_locations", { objective: "messages" })).content);
    expect(g.available).toBe(true);
    expect(g.simulated).toMatch(/simulated/);
    expect(g.spend_by_location.length).toBeGreaterThan(1);
    expect(g.spend_by_location[0]).toMatchObject({ location: expect.any(String), spend: expect.stringMatching(/^\$[\d,.]+$/), share_of_spend: expect.stringMatching(/%$/) });
    expect(g.results_by_location.objective).toBe("Messages");
    expect(g.results_by_location.rows[0]).toHaveProperty("verdict");
  });

  it("rejects unknown tools and invalid input as tool errors", async () => {
    expect((await runTool(a, "delete_campaign", {})).isError).toBe(true);
    expect((await runTool(a, "get_item", { level: "campaign" })).isError).toBe(true);
    expect((await runTool(a, "get_item", { level: "campaign", id: "nope" })).isError).toBe(true);
  });
});

describe("number check on AI text", () => {
  it("accepts numbers from the tool results and flags invented ones", async () => {
    const overview = (await runTool(a, "get_overview", {})).content;
    const spend = JSON.parse(overview).spend as string;
    expect(unmatchedNumbers(`You spent ${spend} this week.`, overview)).toEqual([]);
    expect(unmatchedNumbers("Your CPA rose to $98,765.43.", overview)).toEqual([98765.43]);
  });

  it("the manager summary template only states numbers the engine computed", () => {
    const facts = managerSummaryFacts(a);
    const text = managerSummaryText(facts);
    expect(text).toContain("Headline:");
    expect(unmatchedNumbers(text, JSON.stringify(facts))).toEqual([]);
  });
});
