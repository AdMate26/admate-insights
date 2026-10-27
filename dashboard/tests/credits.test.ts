import { describe, expect, it } from "vitest";
import { costUsd, creditsText, unitsFor } from "@/lib/ai/pricing";

// AdMate Assistant credits: an answer costs what its tokens cost at list prices.
describe("credit pricing", () => {
  it("prices Sonnet 5.5 tokens, cache reads and cache writes", () => {
    // 1M input $2 + 1M output $10 + 1M cache reads $0.20 + 1M cache writes $2.50
    expect(costUsd({ model: "claude-sonnet-5-5", input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 })).toBeCloseTo(14.7, 6);
    // A typical question: 20k in, 8k cached, 1.5k out ≈ 5.7 cents.
    expect(costUsd({ model: "claude-sonnet-5-5", input: 20_000, output: 1_500, cacheRead: 8_000, cacheWrite: 0 })).toBeCloseTo(0.0566, 4);
  });

  it("prices Opus 5.5 at twice Sonnet, and an unknown model at the dearest price", () => {
    const u = { input: 10_000, output: 1_000, cacheRead: 0, cacheWrite: 0 };
    expect(costUsd({ model: "claude-opus-5-5", ...u })).toBeCloseTo(2 * costUsd({ model: "claude-sonnet-5-5", ...u }), 9);
    expect(costUsd({ model: "some-new-model", ...u })).toBeGreaterThan(costUsd({ model: "claude-opus-5-5", ...u }));
  });

  it("turns cost into hundredths of a credit, rounding up, never charging for nothing", () => {
    expect(unitsFor(0, 0.0125)).toBe(0);
    expect(unitsFor(0.0125, 0.0125)).toBe(100); // exactly one credit
    expect(unitsFor(0.0556, 0.0125)).toBe(445); // 4.448 credits → 4.45
    expect(unitsFor(0.000001, 0.0125)).toBe(1); // anything used costs at least 0.01
    // The beta budget: 20 credits = $0.25 of AI usage.
    expect(unitsFor(0.25, 0.0125)).toBe(2000);
  });

  it("shows credits with only the decimals needed", () => {
    expect(creditsText(2000)).toBe("20");
    expect(creditsText(1550)).toBe("15.5");
    expect(creditsText(445)).toBe("4.45");
  });
});
