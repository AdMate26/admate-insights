"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { setFindingStatus, setFindingStatuses } from "@/app/actions";
import { useV5, usePeriodQuery, type View } from "./ctx";
import { Drawer } from "./Drawer";
import { SummaryModal } from "./Summary";
import { Assistant } from "./Assistant";
import { detailOf, keyForEntity, kindOf, type Item, type Level, type VM } from "./core";
import { apiPath } from "@/lib/integration/paths";
import { track } from "@/lib/analytics";

// One v5 page: its view of the analysis (vm), the item panel, the summary report,
// the Assistant and short confirmations. Decisions are saved to the account and
// shown at once (the page then reloads its numbers from the server).

type OpenOpts = { depth?: View; entity?: { level: Level; id: string } | null };
type Status = { status: Item["status"]; until: string | null; dismissReason: string | null };
interface PageCtx {
  vm: VM | null;
  open: (key: string | null, opts?: OpenOpts) => void;
  decide: (key: string, kind: string, extra?: string | number, quiet?: boolean) => Promise<void>;
  decideMany: (keys: string[], kind: string, extra?: string | number, titles?: Record<string, string>) => Promise<void>;
  toast: (text: string) => void;
  openSummary: () => void;
  ask: (about?: string | null) => void;
  askAvailable: boolean;
  page: string; // the page id, for the Assistant's suggested questions
}
const Ctx = createContext<PageCtx | null>(null);
export function usePage() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePage outside V5Page");
  return c;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function statusOf(kind: string, extra?: string | number): Status {
  if (kind === "restore") return { status: "todo", until: null, dismissReason: null };
  if (kind === "remind") return { status: "snoozed", until: addDaysISO(today(), Number(extra ?? 1)), dismissReason: null };
  if (kind === "dismissed") return { status: "dismissed", until: null, dismissReason: String(extra ?? "Not relevant") };
  return { status: "done", until: null, dismissReason: null };
}

// Decisions made on this page show at once, before the server's numbers arrive.
function patch(vm: VM, local: Record<string, Status>): VM {
  if (!Object.keys(local).length) return vm;
  const fix = <T extends Item>(d: T): T => (local[d.key] ? { ...d, ...local[d.key] } : d);
  return {
    ...vm,
    problems: vm.problems.map(fix),
    opportunities: vm.opportunities.map(fix),
    signals: vm.signals.map(fix),
    closed: vm.closed.map(fix),
    details: Object.fromEntries(Object.entries(vm.details).map(([k, d]) => [k, fix(d as Item)])) as VM["details"],
  };
}

export function V5Page({ vm: serverVm, page, askAvailable = false, children }: { vm: VM | null; page: string; askAvailable?: boolean; children: ReactNode }) {
  const { ws, level, readOnly, isSample } = useV5();
  const { params } = usePeriodQuery();
  // Analytics (only if allowed): which kind of account, never its name or numbers.
  const account = readOnly ? "demo" : isSample ? "sample" : "own";
  const hasData = !!serverVm;
  useEffect(() => {
    if (hasData && (page === "overview" || page === "home")) track("analysis_viewed", { account, view: level });
  }, [ws, page, hasData, account, level]);
  const [local, setLocal] = useState<Record<string, Status>>({});
  // New numbers from the server replace the optimistic decisions.
  const [seenVm, setSeenVm] = useState(serverVm);
  if (seenVm !== serverVm) {
    setSeenVm(serverVm);
    setLocal({});
  }
  // Ad set and ad details load when opened (the page leaves them out to stay light).
  const [loaded, setLoaded] = useState<Record<string, Item>>({});
  const vm = useMemo(() => {
    if (!serverVm) return null;
    const base = Object.keys(loaded).length ? { ...serverVm, details: { ...loaded, ...serverVm.details } } : serverVm;
    return patch(base, local);
  }, [serverVm, local, loaded]);
  const [drawer, setDrawer] = useState<{ key: string; depth: View; entity: OpenOpts["entity"] } | null>(null);
  const [summary, setSummary] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [asst, setAsst] = useState<{ open: boolean; about: string | null }>({ open: false, about: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((t: string) => {
    setToastText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastText(null), 3400);
  }, []);
  const open = useCallback(
    async (key: string | null, opts: OpenOpts = {}) => {
      if (!vm) return;
      const k = key ?? (opts.entity ? keyForEntity(vm, opts.entity.level, opts.entity.id) : null);
      if (!k) return;
      let item = detailOf(vm, k);
      if (!item) {
        const q = new URLSearchParams({ ...params, ws, key: k });
        const d = await fetch(apiPath(`/api/v5/detail?${q}`))
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!d) return toast("That item couldn’t be opened. Reload the page and try again.");
        setLoaded((m) => ({ ...m, [k]: d }));
        item = d as Item;
      }
      setDrawer({ key: k, depth: opts.depth ?? level, entity: opts.entity ?? null });
      if (item?.detector) track("recommendation_viewed", { account, view: level, detector: item.detector, kind: kindOf(item) });
    },
    [vm, level, params, ws, toast, account],
  );
  const decide = useCallback(
    async (key: string, kind: string, extra?: string | number, quiet?: boolean) => {
      const d = vm ? detailOf(vm, key) : null;
      const title = d?.title ?? key;
      const s = statusOf(kind, extra);
      setLocal((m) => ({ ...m, [key]: s }));
      if (!quiet)
        toast(
          kind === "restore" ? "Back on the list" : kind === "remind" ? `We’ll remind you on ${new Date(`${s.until}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}` : kind === "done" ? "Noted. AdMate checks whether it worked after your next upload." : "Dismissed",
        );
      if (readOnly) return; // AdMate integration: the public demo shows it but saves nothing
      try {
        await setFindingStatus(ws, key, kind === "restore" ? "todo" : kind === "remind" ? "snoozed" : kind === "dismissed" ? "dismissed" : "done", title, params, kind === "dismissed" ? String(extra ?? "Not relevant") : undefined, kind === "remind" ? Number(extra ?? 1) : undefined);
      } catch {
        setLocal((m) => {
          const n = { ...m };
          delete n[key];
          return n;
        });
        toast("That couldn’t be saved. Please try again.");
      }
    },
    [vm, ws, params, toast, readOnly],
  );
  const decideMany = useCallback(
    async (keys: string[], kind: string, extra?: string | number, titles?: Record<string, string>) => {
      if (!keys.length) return;
      const s = statusOf(kind, extra);
      setLocal((m) => ({ ...m, ...Object.fromEntries(keys.map((k) => [k, s])) }));
      const items = keys.map((k) => ({ key: k, title: (vm ? detailOf(vm, k)?.title : null) ?? titles?.[k] ?? k }));
      if (readOnly) return; // AdMate integration: the public demo shows it but saves nothing
      try {
        await setFindingStatuses(ws, items, kind === "restore" ? "todo" : kind === "remind" ? "snoozed" : kind === "dismissed" ? "dismissed" : "done", params, kind === "dismissed" ? String(extra ?? "Not relevant") : undefined, kind === "remind" ? Number(extra ?? 3) : undefined);
      } catch {
        setLocal((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !keys.includes(k))));
        toast("Those couldn’t be saved. Please try again.");
      }
    },
    [vm, ws, params, toast, readOnly],
  );
  const ask = useCallback((about?: string | null) => setAsst({ open: true, about: about ?? null }), []);

  // "?open=<item>" (from Portfolio or a Telegram message) opens that item once.
  const search = useSearchParams();
  const opened = useRef(false);
  useEffect(() => {
    const k = search.get("open");
    if (!opened.current && k && vm) {
      opened.current = true;
      open(k);
    }
  }, [search, vm, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDrawer(null);
      setSummary(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ctx: PageCtx = { vm, open, decide, decideMany, toast, openSummary: () => setSummary(true), ask, askAvailable, page };
  const d = drawer && vm ? detailOf(vm, drawer.key) : null;
  return (
    <Ctx.Provider value={ctx}>
      {children}
      {d && drawer && <Drawer key={d.key} d={d} depth={drawer.depth} entity={drawer.entity ?? null} onClose={() => setDrawer(null)} />}
      {summary && vm && <SummaryModal vm={vm} onClose={() => setSummary(false)} />}
      {askAvailable && <Assistant open={asst.open} about={asst.about} current={d?.key ?? null} onOpen={() => setAsst({ open: true, about: d?.key ?? null })} onClose={() => setAsst({ open: false, about: null })} />}
      <div aria-live="polite">{toastText && <div className="toast" role="status">{toastText}</div>}</div>
    </Ctx.Provider>
  );
}
