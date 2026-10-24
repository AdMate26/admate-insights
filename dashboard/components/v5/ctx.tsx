"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { PERIOD_KEYS, type Level as View } from "@/lib/levels";
import { makeFmt, type Item } from "./core";

export type { View };
export interface Acct {
  id: string;
  name: string;
  industry: string | null;
  country: string | null;
  isSample: boolean;
}
// What every v5 screen of one ad account shares: the account, the person's view,
// the dates that have data and the automatic checks they switched off.
export interface Shared {
  ws: string;
  name: string;
  level: View;
  cur: string;
  end: string | null; // the latest day with data
  min: string | null; // the first day with data
  accounts: Acct[];
  isSample: boolean;
  muted: string[];
  email: string;
  askReady: boolean; // the Assistant has its API key (ANTHROPIC_API_KEY)
}

const SharedCtx = createContext<Shared | null>(null);

export function V5Provider({ value, children }: { value: Shared; children: ReactNode }) {
  return <SharedCtx.Provider value={value}>{children}</SharedCtx.Provider>;
}

export function useV5() {
  const s = useContext(SharedCtx);
  if (!s) throw new Error("useV5 outside V5Provider");
  const f = useMemo(() => makeFmt(s.cur), [s.cur]);
  const muted = useMemo(() => new Set(s.muted), [s.muted]);
  const shown = useCallback((d: Pick<Item, "detector">) => !muted.has(d.detector), [muted]);
  return { ...s, f, shown, isBeg: s.level === "beginner", isAdv: s.level === "advanced" };
}

// The selected period from the address bar (from, to, cmp, …), kept when moving between pages.
export function usePeriodQuery() {
  const search = useSearchParams();
  return useMemo(() => {
    const keep = new URLSearchParams();
    for (const k of PERIOD_KEYS) {
      const v = search.get(k);
      if (v) keep.set(k, v);
    }
    const params: Record<string, string> = Object.fromEntries(keep.entries());
    const qs = keep.toString();
    return { params, qs, q: qs ? `?${qs}` : "" };
  }, [search]);
}

// Renders on top of everything, still inside the v5 frame (so its colours apply).
const noop = () => () => {};
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const el = mounted ? document.getElementById("v5root") : null;
  return el ? createPortal(children, el) : null;
}

// Local state that starts from a prop and starts over whenever the prop changes
// (e.g. settings shown at once, then replaced by what the server saved).
export function useSynced<T>(prop: T) {
  const [state, setState] = useState(prop);
  const [seen, setSeen] = useState(prop);
  if (seen !== prop) {
    setSeen(prop);
    setState(prop);
  }
  return [state, setState] as const;
}
