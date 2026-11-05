import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_DEMO_WORKSPACE } from "@/lib/integration/public-demo";

const state = vi.hoisted(() => ({
  publicRequest: true,
  database: {},
  analyze: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => state.database }));
vi.mock("@/lib/integration/public-demo.server", () => ({ isPublicDemoRequest: async () => state.publicRequest }));
vi.mock("@/lib/data/workspaces", () => ({ loadAnalysis: state.analyze, loadFacts: vi.fn() }));
vi.mock("@/lib/analysis/viewModel", () => ({ viewModel: (analysis: unknown) => ({ analysis }) }));

import { loadView } from "@/lib/data/view";

beforeEach(() => {
  state.publicRequest = true;
  state.database = {};
  state.analyze.mockReset().mockImplementation(async (workspaceId: string) => ({
    workspace: { id: workspaceId },
    coverage: { dailyFrom: "2026-10-01" },
    selection: { b: { from: "2026-10-29" } },
  }));
});

describe("public sample analysis reuse", () => {
  it("shares an in-flight calculation across concurrent pages and subsequent badge reads", async () => {
    const [first, second] = await Promise.all([loadView(PUBLIC_DEMO_WORKSPACE), loadView(PUBLIC_DEMO_WORKSPACE)]);
    const again = await loadView(PUBLIC_DEMO_WORKSPACE, { from: undefined, to: undefined });
    expect(state.analyze).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(again).toBe(first);
  });

  it("uses the complete selected dates, comparisons and reports as the cache key", async () => {
    const period = { from: "2026-10-01", to: "2026-10-07", cmp: "custom", cfrom: "2026-09-01", cto: "2026-09-07" };
    const original = await loadView(PUBLIC_DEMO_WORKSPACE, period);
    expect(await loadView(PUBLIC_DEMO_WORKSPACE, { cto: period.cto, cfrom: period.cfrom, cmp: period.cmp, to: period.to, from: period.from })).toBe(original);
    for (const patch of [{ from: "2026-10-02" }, { to: "2026-10-08" }, { cmp: "none" }, { cfrom: "2026-09-02" }, { cto: "2026-09-08" }, { report: "sample-report" }, { vs: "previous-report" }]) {
      expect(await loadView(PUBLIC_DEMO_WORKSPACE, { ...period, ...patch })).not.toBe(original);
    }
    expect(state.analyze).toHaveBeenCalledTimes(8);
  });

  it("never serves a public cache entry to a private request, including the same account ID", async () => {
    const demo = await loadView(PUBLIC_DEMO_WORKSPACE);
    state.publicRequest = false;
    const firstPrivate = await loadView(PUBLIC_DEMO_WORKSPACE);
    const secondPrivate = await loadView(PUBLIC_DEMO_WORKSPACE);
    expect(firstPrivate).not.toBe(demo);
    expect(secondPrivate).not.toBe(firstPrivate);
    expect(state.analyze).toHaveBeenCalledTimes(3);
  });

  it("does not cache other workspaces even when the request is public", async () => {
    const first = await loadView("another-account");
    expect(await loadView("another-account")).not.toBe(first);
    expect(state.analyze).toHaveBeenCalledTimes(2);
  });

  it("recalculates when a server instance gets a freshly seeded sample database", async () => {
    const first = await loadView(PUBLIC_DEMO_WORKSPACE);
    state.database = {};
    expect(await loadView(PUBLIC_DEMO_WORKSPACE)).not.toBe(first);
    expect(state.analyze).toHaveBeenCalledTimes(2);
  });

  it("retries failures instead of keeping a rejected calculation", async () => {
    state.analyze.mockRejectedValueOnce(new Error("Temporary sample read failure"));
    await expect(loadView(PUBLIC_DEMO_WORKSPACE)).rejects.toThrow("Temporary sample read failure");
    expect(await loadView(PUBLIC_DEMO_WORKSPACE)).not.toBeNull();
    expect(state.analyze).toHaveBeenCalledTimes(2);
  });

  it("bounds memory while visitors explore many different periods", async () => {
    for (let day = 1; day <= 12; day++) {
      await loadView(PUBLIC_DEMO_WORKSPACE, { from: `2026-10-${String(day).padStart(2, "0")}` });
    }
    expect(state.analyze).toHaveBeenCalledTimes(12);
    await loadView(PUBLIC_DEMO_WORKSPACE, { from: "2026-10-01" });
    expect(state.analyze).toHaveBeenCalledTimes(13);
  });
});
