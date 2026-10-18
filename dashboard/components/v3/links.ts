// Links that keep the selected period (and other page state) in the URL.
export type SP = Record<string, string | string[] | undefined>;

export function withParams(sp: SP, patch: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "?";
}

const PERIOD = ["from", "to", "cmp", "cfrom", "cto", "report", "vs"];
// Only the period, for links to another page.
export function periodQuery(sp: SP): string {
  const q = new URLSearchParams();
  for (const k of PERIOD) if (typeof sp[k] === "string") q.set(k, sp[k] as string);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const one = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
