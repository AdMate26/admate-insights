import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/analyze";
import { computePlan } from "@/lib/analysis/plan";
import { viewModel } from "@/lib/analysis/viewModel";
import { addDays } from "@/lib/dates";
import { SAMPLE_ACCOUNT, SAMPLE_CLIENTS } from "@/lib/sample/generate";
import { END, inputFor } from "./helpers";

const MIN = addDays(END, -89);
const vmFor = (client = SAMPLE_ACCOUNT, params = {}) => {
  const a = analyze(inputFor(client, params, true));
  return { a, v: viewModel(a, MIN) };
};

describe("view model shared by the app and the prototype", () => {
  const { a, v } = vmFor();

  it("money at stake looks backward and uses the right words", () => {
    const rows = [...v.levels.campaign, ...v.levels.ad_group, ...v.levels.ad].filter((r) => r.impact);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.impact!.amount).toBeGreaterThanOrEqual(0);
      expect(r.mode === "roas" ? ["extra revenue", "lost revenue"] : ["extra cost", "saved"]).toContain(r.impact!.label);
    }
    for (const p of v.problems) expect(p.impact.amount).toBeGreaterThanOrEqual(0);
  });

  it("a problem's money is extra cost or lost revenue, never a gain", () => {
    for (const p of v.problems.filter((x) => x.impact.known)) expect(["extra cost", "lost revenue"]).toContain(p.impact.label);
  });

  it("what changed: at most three movers per goal, biggest money first", () => {
    for (const o of v.objectives) {
      expect(o.movers.length).toBeLessThanOrEqual(3);
      const amounts = o.movers.map((m) => Math.abs(m.amount));
      expect(amounts).toEqual([...amounts].sort((x, y) => y - x));
      for (const m of o.movers) {
        expect(Math.abs(m.amount)).toBeGreaterThanOrEqual(1);
        expect(m.worse).toBe(m.amount > 0);
      }
    }
  });

  it("drivers explain the change when there is a comparison period", () => {
    const withChange = v.objectives.filter((o) => o.previous != null && o.value != null);
    expect(withChange.length).toBeGreaterThan(0);
    expect(withChange.some((o) => o.drivers && o.drivers.length > 0)).toBe(true);
  });

  it("one row per spending campaign, ad set and ad, with names of their parents", () => {
    expect(v.levels.campaign.length).toBe(a.campaigns.filter((c) => c.b.spend > 0).length);
    for (const r of v.levels.ad) {
      expect(r.campaignName).toBeTruthy();
      expect(r.adSetName).toBeTruthy();
    }
    const total = v.levels.campaign.reduce((s, r) => s + r.share, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
  });

  it("every plan item at every level has its detail", () => {
    for (const lv of ["campaign", "ad_group", "ad"] as const) for (const p of computePlan(a, lv)) expect(v.details[p.key]).toBeDefined();
  });

  it("without a comparison period nothing claims a previous value", () => {
    const { v: alone } = vmFor(SAMPLE_ACCOUNT, { from: addDays(END, -6), to: END, cmp: "none" });
    expect(alone.compareLabel).toBeNull();
    for (const o of alone.objectives) expect(o.movers).toEqual([]);
  });

  it("is plain data, so pages can pass it to the browser", () => {
    for (const client of SAMPLE_CLIENTS) {
      const { v: other } = vmFor(client);
      expect(() => JSON.stringify(other)).not.toThrow();
      expect(JSON.parse(JSON.stringify(other)).levels.campaign.length).toBe(other.levels.campaign.length);
    }
  });
});
