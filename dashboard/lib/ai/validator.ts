// Numeric validator (PRD §9.4): every number an AI narrative states must appear
// in the facts it was given. Returns the numbers that could not be matched.

function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /[-−+]?\$?\d[\d,]*(?:\.\d+)?\s*(%|×|x|k|K|M)?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[−]/g, "-").replace(/[$,\s+]/g, "");
    const unit = m[1];
    let n = parseFloat(raw.replace(/[%×xkKM]/g, ""));
    if (!Number.isFinite(n)) continue;
    if (unit === "k" || unit === "K") n *= 1_000;
    if (unit === "M") n *= 1_000_000;
    out.push(Math.abs(n));
  }
  return out;
}

export function unmatchedNumbers(text: string, factsJson: string): number[] {
  const allowed = numbersIn(factsJson);
  const tolerance = (n: number) => Math.max(0.01, Math.abs(n) * 0.006); // rounding
  return numbersIn(text).filter((n) => {
    if (n <= 10 && Number.isInteger(n)) return false; // small counts ("2 steps", "3 days") are fine
    return !allowed.some((a) => Math.abs(a - n) <= tolerance(a));
  });
}
