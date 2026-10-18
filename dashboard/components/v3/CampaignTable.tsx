"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LevelRow } from "@/lib/analysis/insights";
import { money, num, pct } from "@/lib/format";
import { ObjectiveSelect } from "../ObjectiveSelect";
import { RoleSelect } from "../RoleSelect";
import { cx } from "../ui";
import { DeltaChip, fmtKpi, KindTag, Plat, PrioChip } from "./bits";

export type TableRow = LevelRow & { href: string | null };
type Level = "campaign" | "ad_group" | "ad";
const LEVEL: Record<Level, string> = { campaign: "Campaign", ad_group: "Ad set", ad: "Ad" };

// Campaign › ad set › ad in one table. Every ad set names its campaign and every
// ad its campaign and ad set, so items with the same objective can't be confused.
export function CampaignTable({ ws, levels, level, compareLabel, currency, levelHref }: { ws: string; levels: Record<Level, TableRow[]>; level: Level; compareLabel: string | null; currency: string; levelHref: Record<Level, string> }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [diag, setDiag] = useState(false);
  const [obj, setObj] = useState<string | null>(null);
  const camps = levels.campaign.filter((r) => !obj || r.objective === obj);
  const objs = [...new Map(levels.campaign.map((r) => [r.objective, r.objectiveLabel])).entries()];
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOpen = camps.length > 0 && camps.every((c) => expanded.has(c.id));

  const row = (r: TableRow, depth: 0 | 1 | 2, twisty?: ReactNode) => (
    <tr
      key={`${r.level}:${r.id}`}
      tabIndex={r.href ? 0 : -1}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("select, button, a")) return;
        if (r.href) router.push(r.href, { scroll: false });
      }}
      onKeyDown={(e) => e.key === "Enter" && r.href && router.push(r.href, { scroll: false })}
      className={cx("cursor-pointer border-b border-line align-top hover:bg-surface", depth === 1 && "bg-surface/40", depth === 2 && "bg-surface/70")}
    >
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          <PrioChip p={r.priority} />
          <KindTag k={r.kind} />
        </div>
      </td>
      <td className="py-2.5 pr-3" style={{ paddingLeft: depth * 22 }}>
        <div className="flex items-start gap-1.5">
          {twisty ?? <span className="inline-block w-5" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="num text-[10px] uppercase tracking-wider text-faint">{LEVEL[r.level]}</span>
              <span className="font-medium">{r.name}</span>
              {r.isNew && <span className="num text-[10px] uppercase text-violet">new</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Plat p={r.platform} />
              {depth > 0 && <span>{r.objectiveLabel}</span>}
              {r.level === "ad_group" && (
                <span>
                  in campaign <b className="font-medium text-fg">{r.campaignName}</b>
                </span>
              )}
              {r.level === "ad" && (
                <span>
                  in <b className="font-medium text-fg">{r.campaignName}</b> › <b className="font-medium text-fg">{r.adSetName}</b>
                </span>
              )}
              {r.level === "campaign" && <ObjectiveSelect workspaceId={ws} campaignId={r.id} value={r.objective} source={r.objectiveSource} />}
              {r.level === "campaign" && <RoleSelect workspaceId={ws} campaignId={r.id} value={r.role} source={r.roleSource} />}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="num">{money(r.spend, currency)}</div>
        <div className="num text-[11px] text-faint">{pct(r.share, 0)} of all</div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="num">
          {r.kpiShort} {fmtKpi(r.kpi, r.mode, currency)}
        </div>
        <DeltaChip change={r.change} mode={r.mode} confidence={r.confidence} />
        {r.kpiA !== null && <div className="num text-[11px] text-faint">was {fmtKpi(r.kpiA, r.mode, currency)}</div>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="num">{r.mode === "cpm" ? "—" : num(r.results)}</div>
        <div className="text-[11px] text-faint">{r.mode === "cpm" ? "judged by CPM" : r.resultLabel}</div>
      </td>
      {diag && (
        <>
          <td className="num px-3 py-2.5 text-right">{pct(r.ctr, 2)}</td>
          <td className="num px-3 py-2.5 text-right">{money(r.cpm, currency)}</td>
        </>
      )}
      <td className="px-3 py-2.5 text-xs">{r.label ?? ""}</td>
      <td className="px-3 py-2.5 text-right text-xs text-muted">{r.href ? "Open ›" : ""}</td>
    </tr>
  );
  const tw = (id: string, n: number, what: string) =>
    n > 0 ? (
      <button type="button" className="w-5 shrink-0 text-muted hover:text-fg" aria-expanded={expanded.has(id)} aria-label={`${expanded.has(id) ? "Hide" : "Show"} ${what}`} onClick={() => toggle(id)}>
        {expanded.has(id) ? "▾" : "▸"}
      </button>
    ) : undefined;

  const body: ReactNode[] = [];
  if (level === "campaign") {
    for (const c of camps) {
      const sets = levels.ad_group.filter((s) => s.campaignId === c.id);
      body.push(row(c, 0, tw(c.id, sets.length, "ad sets")));
      if (!expanded.has(c.id)) continue;
      for (const s of sets) {
        const ads = levels.ad.filter((x) => x.adSetId === s.id);
        body.push(row(s, 1, tw(s.id, ads.length, "ads")));
        if (expanded.has(s.id)) for (const x of ads) body.push(row(x, 2));
      }
    }
  } else {
    for (const c of camps) {
      const items = levels[level].filter((x) => x.campaignId === c.id);
      if (!items.length) continue;
      body.push(
        <tr key={`g:${c.id}`} className="border-b border-line bg-surface">
          <td colSpan={diag ? 9 : 7} className="px-3 py-1.5 text-xs">
            <span className="num mr-1 text-[10px] uppercase tracking-wider text-faint">Campaign</span>
            <b className="font-medium">{c.name}</b>
            <span className="text-muted">
              {" "}
              · {c.objectiveLabel} · {c.platform}
            </span>
          </td>
        </tr>,
      );
      for (const x of items) body.push(row(x, level === "ad_group" ? 1 : 2));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="View">
          {(
            [
              ["campaign", "Campaign › ad set › ad"],
              ["ad_group", "All ad sets"],
              ["ad", "All ads"],
            ] as [Level, string][]
          ).map(([k, n]) => (
            <Link key={k} href={levelHref[k]} scroll={false} aria-current={k === level ? "true" : undefined} className={cx("rounded-full border px-3 py-1 text-sm", k === level ? "border-violet bg-violet-soft text-violet" : "border-line text-muted hover:text-fg")}>
              {n} <span className="num ml-1">{levels[k].length}</span>
            </Link>
          ))}
        </div>
        {level === "campaign" && (
          <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-surface" onClick={() => setExpanded(allOpen ? new Set() : new Set([...camps.map((c) => c.id)]))}>
            {allOpen ? "Collapse all" : "Expand all ad sets"}
          </button>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={diag} onChange={(e) => setDiag(e.target.checked)} className="accent-[var(--violet)]" /> Show CTR and CPM
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Objective">
        <button type="button" onClick={() => setObj(null)} aria-pressed={!obj} className={cx("rounded-full border px-2.5 py-0.5 text-xs", !obj ? "border-violet text-violet" : "border-line text-muted")}>
          All objectives
        </button>
        {objs.map(([o, label]) => (
          <button key={o} type="button" onClick={() => setObj(o)} aria-pressed={obj === o} className={cx("rounded-full border px-2.5 py-0.5 text-xs", obj === o ? "border-violet text-violet" : "border-line text-muted")}>
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="label border-b border-line text-left !text-[10px]">
              <th className="px-3 py-2 font-normal">Priority · state</th>
              <th className="min-w-[320px] py-2 pl-7 pr-3 font-normal">Name</th>
              <th className="px-3 py-2 text-right font-normal">Spend</th>
              <th className="px-3 py-2 text-right font-normal">Main result {compareLabel ? `(▲▼ vs ${compareLabel})` : ""}</th>
              <th className="px-3 py-2 text-right font-normal">Results</th>
              {diag && (
                <>
                  <th className="px-3 py-2 text-right font-normal">CTR</th>
                  <th className="px-3 py-2 text-right font-normal">CPM</th>
                </>
              )}
              <th className="px-3 py-2 font-normal">Next step</th>
              <th />
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Click ▸ to see a campaign’s ad sets and ads. Click any row for its analysis and daily chart.</p>
    </div>
  );
}
