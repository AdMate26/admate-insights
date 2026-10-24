// Money and results as the v5 screens show them (prototype v5.1), shared by the
// browser and the server (alert texts and Telegram messages must match the page).
import type { KpiMode } from "./metrics/objectives";

// Money as the prototype shows it: whole amounts from 100 up, cents below, 3 decimals
// under 0.10 (cost per follow is often a fraction of a cent).
export function makeFmt(currency: string) {
  const cache = new Map<number, Intl.NumberFormat>();
  const nf = (d: number) => {
    let f = cache.get(d);
    if (!f) {
      try {
        f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d });
      } catch {
        f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
      }
      cache.set(d, f);
    }
    return f;
  };
  const money = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v === 0) return nf(0).format(0);
    const a = Math.abs(v);
    const s = nf(a >= 100 ? 0 : a >= 0.1 ? 2 : 3).format(a);
    return v < 0 ? `−${s}` : s;
  };
  const kpi = (v: number | null | undefined, mode: KpiMode | "neutral") => (v == null || !Number.isFinite(v) ? "—" : mode === "roas" ? `${v.toFixed(2)}×` : money(v));
  return { money, kpi, currency };
}
export type Fmt = ReturnType<typeof makeFmt>;
