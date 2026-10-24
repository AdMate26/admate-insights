"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
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
  readOnly: boolean; // AdMate integration: a public demo visitor (nothing is saved)
}

const SharedCtx = createContext<Shared | null>(null);
const NudgeCtx = createContext<(what: string) => void>(() => {});

export function V5Provider({ value, children }: { value: Shared; children: ReactNode }) {
  const [nudge, setNudge] = useState<string | null>(null);
  return (
    <SharedCtx.Provider value={value}>
      <NudgeCtx.Provider value={setNudge}>
        {children}
        {nudge && (
          <Portal>
            <SignUpNudge what={nudge} onClose={() => setNudge(null)} />
          </Portal>
        )}
      </NudgeCtx.Provider>
    </SharedCtx.Provider>
  );
}

// AdMate integration: what a public demo visitor sees instead of a change being
// saved. The server refuses visitor changes regardless; this keeps the page usable.
function SignUpNudge({ what, onClose }: { what: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="nudge-t" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="onboard" style={{ maxWidth: 460 }}>
          <div>
            <span className="label">Public demo</span>
            <h2 id="nudge-t" style={{ marginTop: 6 }}>
              Sign up free to {what}
            </h2>
          </div>
          <p>This demo is read-only, so changes here aren’t saved. With a free account you can upload your own report and keep everything you set.</p>
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn primary" href="/login">
              Sign up free
            </a>
            <button className="btn" type="button" onClick={onClose}>
              Keep exploring
            </button>
          </p>
        </div>
      </div>
    </>
  );
}

export function useV5() {
  const s = useContext(SharedCtx);
  if (!s) throw new Error("useV5 outside V5Provider");
  const f = useMemo(() => makeFmt(s.cur), [s.cur]);
  const muted = useMemo(() => new Set(s.muted), [s.muted]);
  const shown = useCallback((d: Pick<Item, "detector">) => !muted.has(d.detector), [muted]);
  const nudge = useContext(NudgeCtx);
  return { ...s, f, shown, nudge, isBeg: s.level === "beginner", isAdv: s.level === "advanced" };
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
