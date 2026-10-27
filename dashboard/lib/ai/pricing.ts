// What an AI answer cost, from its token usage, at Anthropic's list prices (US dollars
// per million tokens, checked 2026-10). Cache writes (5-minute) cost 1.25 × input.
// Kept apart from credits.ts so it can be tested without a database.

export type TokenUsage = { model: string; input: number; output: number; cacheRead: number; cacheWrite: number };

const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};
// A model not in the list (e.g. a refusal fallback) is priced like the dearest one,
// so a person is never charged less than it cost.
const FALLBACK_PRICE = { input: 10, output: 50, cacheRead: 0.5 };

export function costUsd(u: TokenUsage): number {
  const p = PRICE[u.model] ?? FALLBACK_PRICE;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 1.25) / 1_000_000;
}

// Credits in hundredths, rounded up: an answer that cost anything uses at least 0.01 credit.
export function unitsFor(cost: number, creditUsd: number): number {
  return cost > 0 ? Math.ceil((cost / creditUsd) * 100 - 1e-9) : 0;
}

export const creditsText = (units: number) => (units / 100).toFixed(units % 100 === 0 ? 0 : units % 10 === 0 ? 1 : 2);
