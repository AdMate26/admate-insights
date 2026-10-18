import type { Unit } from "./metrics/metrics";

// Money with sensible precision: ad metrics like cost-per-follow are often
// fractions of a cent, so small values keep 3 significant digits.
export function money(v: number | null | undefined, currency = "USD", compact = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  // Compact mode is for estimates (impact ranges, summaries): no false precision.
  if (compact && abs >= 1_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
  }
  if (compact && abs >= 10) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  }
  let digits = 2;
  if (abs > 0 && abs < 0.1) digits = 4;
  else if (abs > 0 && abs < 1) digits = 3;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits }).format(v);
}

export function num(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (compact && Math.abs(v) >= 10_000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }).format(v);
}

export function pct(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const p = v * 100;
  const d = digits ?? (Math.abs(p) < 1 ? 2 : 1);
  return `${p.toFixed(d)}%`;
}

export function signedPct(change: number | null | undefined): string {
  if (change === null || change === undefined || !Number.isFinite(change)) return "—";
  const p = change * 100;
  const s = Math.abs(p) >= 100 ? p.toFixed(0) : Math.abs(p) >= 10 ? p.toFixed(0) : p.toFixed(1);
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${s.replace("-", "")}%`;
}

export function formatValue(v: number | null | undefined, unit: Unit, currency = "USD", compact = false): string {
  switch (unit) {
    case "currency":
      return money(v, currency, compact);
    case "percent":
      return pct(v);
    case "ratio":
      return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(2);
    default:
      return num(v, compact);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${y !== new Date().getFullYear() ? `, ${y}` : ""}`;
}

export function rangeLabel(from: string, to: string): string {
  if (from === to) return shortDate(from);
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${MONTHS[m1 - 1]} ${d1}–${d2}${y2 !== new Date().getFullYear() ? `, ${y2}` : ""}`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}
