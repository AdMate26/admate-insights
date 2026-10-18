// Entity matching across uploads: platform ID → exact name → fuzzy (user-confirmed).

export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function bigrams(s: string): Map<string, number> {
  const t = nameKey(s).replace(/[^a-z0-9\u0080-￿ ]/g, " ").replace(/\s+/g, " ");
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

// Sørensen–Dice similarity on character bigrams (0…1).
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    inter += Math.min(n, B.get(g) ?? 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

export interface MatchSuggestion {
  incoming: string;
  existingId: string;
  existingName: string;
  score: number;
  // Pre-ticked in the review UI when very likely the same campaign.
  likely: boolean;
}

export function suggestMatches(
  incoming: string[],
  existing: { id: string; name: string }[],
  exactKeys: Set<string>,
): MatchSuggestion[] {
  const out: MatchSuggestion[] = [];
  for (const name of new Set(incoming)) {
    if (exactKeys.has(nameKey(name))) continue;
    let best: { id: string; name: string; score: number } | null = null;
    for (const e of existing) {
      const s = similarity(name, e.name);
      if (!best || s > best.score) best = { ...e, score: s };
    }
    if (best && best.score >= 0.85) {
      out.push({ incoming: name, existingId: best.id, existingName: best.name, score: best.score, likely: best.score >= 0.95 });
    }
  }
  return out;
}
