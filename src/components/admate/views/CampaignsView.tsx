import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { PerformanceBadge, SignalBadge, StatusPill } from "@/components/admate/badges";
import { Sparkline } from "@/components/admate/Sparkline";
import type { AdMateAnalysis } from "@/lib/admate.functions";
import {
  FAMILY_ORDER,
  PERFORMANCE_ORDER,
  type CampaignFinding,
  type Performance,
} from "@/lib/analysis/engine";
import { brandMeta, type WorkspaceBrand } from "@/lib/brands";
import { platformMeta, type Platform } from "@/lib/platforms";
import { filterCampaignObjectives } from "@/lib/campaign-objective-filter";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const PERF_TALLY_CLASS: Record<Performance, string> = {
  High: "tally--good",
  Moderate: "tally--warn",
  Low: "tally--crit",
  "In Review": "tally--info",
  Error: "tally--error",
};
const SPARK_CLASS: Record<Performance, string> = {
  High: "spark--good",
  Moderate: "spark--warn",
  Low: "spark--crit",
  "In Review": "spark--info",
  Error: "spark--error",
};

export function CampaignsView({
  analyses,
  brand,
  platform,
  platforms,
  onSelectPlatform,
  objective,
  onSelectObjective,
}: {
  analyses: AdMateAnalysis[];
  brand: WorkspaceBrand;
  platform: Platform;
  /** The selected brand's connected platforms (tabs are scoped to these). */
  platforms: readonly Platform[];
  onSelectPlatform: (p: Platform) => void;
  objective: string | undefined;
  onSelectObjective: (objective: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byPlatform = new Map(analyses.map((a) => [a.platform, a]));
  const active = byPlatform.get(platform);
  const {
    findings,
    options,
    objective: selectedObjective,
  } = filterCampaignObjectives(active?.findings ?? [], objective);
  const lowOf = (a?: AdMateAnalysis) =>
    (a?.findings ?? []).filter((f) => f.performance === "Low").length;

  const tally = PERFORMANCE_ORDER.map((p) => ({
    perf: p,
    count: findings.filter((f) => f.performance === p).length,
  }));
  const spend = findings.reduce((s, f) => s + f.spend, 0);

  // Budget / spend at risk uses the visible objective's Low findings.
  // The amount is the analyzer's objective-aware exposure — defensible budget-at-
  // risk (share of spend that missed a target, lower-funnel) or actual spend
  // exposure (upper-funnel / no target). No invented revenue. In Review, Error,
  // Moderate and High are never counted.
  const risky = findings
    .filter((f) => f.performance === "Low" && f.exposure.amount > 0)
    .sort((a, b) => b.exposure.amount - a.exposure.amount);
  const riskTotal = risky.reduce((s, f) => s + f.exposure.amount, 0);

  return (
    <section aria-labelledby="camp-title">
      <div className="view-head">
        <h1 className="view-title" id="camp-title">
          Which campaigns are earning their budget
        </h1>
        <p className="view-sub">
          {brandMeta(brand).label} · last 7 complete days. Every campaign is graded on the metric
          its objective was actually bought against — not one blended number. Click a row for the
          full signal, why and action.
        </p>
      </div>

      <div
        className="tabs"
        role="tablist"
        aria-label={`${brandMeta(brand).label} connected platforms`}
      >
        {platforms.map((p) => {
          const a = byPlatform.get(p);
          const n = a?.findings.length ?? 0;
          const low = lowOf(a);
          return (
            <button
              key={p}
              role="tab"
              aria-selected={p === platform}
              className={`tab${p === platform ? " is-active" : ""}`}
              onClick={() => onSelectPlatform(p)}
            >
              <span className={`dot dot--${p}`} aria-hidden="true" />
              <span className="tab-name">{platformMeta(p).label}</span>
              <span className="tab-count">{n}</span>
              {low ? <span className="tab-attn">{low} need attention</span> : null}
            </button>
          );
        })}
      </div>

      <div className="campaign-objective-filter">
        <label htmlFor="campaign-objective">Campaign Objective</label>
        <div className="platform-select-wrap">
          <select
            id="campaign-objective"
            value={selectedObjective ?? ""}
            onChange={(event) => {
              setOpenId(null);
              onSelectObjective(event.target.value);
            }}
          >
            <option value="">All objectives</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
      </div>

      <div className="tally-row">
        {tally.map((t) => (
          <div key={t.perf} className={`tally ${PERF_TALLY_CLASS[t.perf]}`}>
            <b>{t.count}</b>
            <span>{t.perf}</span>
          </div>
        ))}
        <div className="tally">
          <b>{money(spend)}</b>
          <span>spent in 7 days</span>
        </div>
      </div>

      <div className="camp-grid">
        <div className="camp-sections">
          {FAMILY_ORDER.map((fam) => {
            const list = findings
              .filter((f) => f.objectiveFamily === fam)
              .sort((a, b) => b.priority - a.priority);
            if (!list.length) return null;
            const cols = list[0].supportingColumns; // objective-specific columns
            const famSpend = list.reduce((s, f) => s + f.spend, 0);
            return (
              <div className="panel" key={fam}>
                <div className="panel-head">
                  <h2 className="panel-title">Campaign Objective: {list[0].objectiveLabel}</h2>
                  <span className="panel-note">
                    {money(famSpend)} · {list.length} campaigns
                  </span>
                </div>
                <p className="fam-blurb">{list[0].objectiveExplanation}</p>
                <div className="ledger-wrap">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Spend</th>
                        {cols.map((c) => (
                          <th key={c.label}>{c.label}</th>
                        ))}
                        <th>Trend</th>
                        <th>Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((f) => (
                        <CampaignRows
                          key={f.campaignId}
                          f={f}
                          open={openId === f.campaignId}
                          onToggle={() => setOpenId(openId === f.campaignId ? null : f.campaignId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {findings.length === 0 ? (
            <div className="panel">
              <div className="empty">
                <strong>No campaigns found for this objective.</strong>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="panel risk-panel" aria-label="Budget at risk">
          <div className="panel-head">
            <h2 className="panel-title">Budget at risk</h2>
            <span className="panel-note">
              {risky.length
                ? `${money(riskTotal)} · ${risky.length} campaign${risky.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          {risky.length ? (
            <div>
              {risky.slice(0, 6).map((f) => (
                <div className="risk-item" key={f.campaignId}>
                  <div className="risk-top">
                    <p className="risk-n">{f.campaignName}</p>
                    <span className="risk-w">{money(f.exposure.amount)}</span>
                  </div>
                  <p className="risk-m">
                    {/* Objective-aware: defensible target-miss (lower funnel) vs actual spend
                        exposure (upper funnel / no target) — never invented revenue. */}
                    {f.exposure.kind === "budget_at_risk" ? "Budget at risk" : "Spend at risk"} ·{" "}
                    {f.objectiveLabel.toLowerCase()} — {f.primaryMetric} {f.primaryMetricValue}
                    {f.targetOrBaseline ? ` against ${f.targetOrBaseline}` : ""}, {money(f.spend)}{" "}
                    spent
                  </p>
                  <p className="risk-a">{f.aiRecommendedAction ?? f.action}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <strong>Nothing below target</strong>
              No campaign here is rated Low. Lower-funnel misses show as defensible budget at risk;
              upper-funnel Low campaigns show their actual spend exposure — never invented dollar
              loss.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function CampaignRows({
  f,
  open,
  onToggle,
}: {
  f: CampaignFinding;
  open: boolean;
  onToggle: () => void;
}) {
  const colCount = 4 + f.supportingColumns.length;
  return (
    <>
      <tr className="camp-row" data-open={open} data-perf={f.performance} onClick={onToggle}>
        <td>
          <span className="camp-name">
            <ChevronRight size={14} aria-hidden="true" className="camp-caret" />
            {f.campaignName}
          </span>
          <span className="camp-sub">
            {f.campaignStateLabel} · {f.signal}
          </span>
        </td>
        <td>{money(f.spend)}</td>
        {f.supportingColumns.map((c) => (
          <td key={c.label}>{c.value}</td>
        ))}
        <td className={`spark-cell ${SPARK_CLASS[f.performance]}`}>
          <Sparkline values={f.trend} />
        </td>
        <td>
          <StatusPill performance={f.performance} />
        </td>
      </tr>
      {open ? (
        <tr className="camp-detail">
          <td colSpan={colCount}>
            <div className="detail-block">
              <div className="detail-block-head">
                <PerformanceBadge performance={f.performance} />
                <span className="detail-kpi">
                  {f.primaryMetric} {f.primaryMetricValue}
                  {f.targetOrBaseline ? ` · ${f.targetOrBaseline}` : ""}
                </span>
              </div>
              <div className="detail-cols">
                <div>
                  <h4>Signal</h4>
                  <p>
                    <SignalBadge signal={f.signal} />
                  </p>
                  <h4>Why</h4>
                  <p>{f.aiExplanation ?? f.why}</p>
                  <h4>Action</h4>
                  <p>{f.aiRecommendedAction ?? f.action}</p>
                </div>
                <div>
                  <h4>Evidence</h4>
                  <table className="mini-evidence">
                    <tbody>
                      {f.evidence.slice(0, 6).map((e) => (
                        <tr key={e.label}>
                          <td>{e.label}</td>
                          <td className="mono">{e.current}</td>
                          <td className="mono muted">{e.previous}</td>
                          <td className="mono">
                            {e.changePct === null
                              ? "—"
                              : `${e.changePct > 0 ? "+" : ""}${e.changePct.toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
