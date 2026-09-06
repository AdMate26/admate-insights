import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { PerformanceBadge, SignalBadge, StatusPill } from "@/components/admate/badges";
import { Sparkline } from "@/components/admate/Sparkline";
import type { AdMateAnalysis } from "@/lib/admate.functions";
import {
  FAMILY_ORDER,
  PERFORMANCE_ORDER,
  type CampaignFinding,
  type Performance,
} from "@/lib/analysis/engine";
import { brandMeta, type Brand } from "@/lib/brands";
import { platformMeta, type Platform } from "@/lib/platforms";

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
}: {
  analyses: AdMateAnalysis[];
  brand: Brand;
  platform: Platform;
  /** The selected brand's connected platforms (tabs are scoped to these). */
  platforms: readonly Platform[];
  onSelectPlatform: (p: Platform) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byPlatform = new Map(analyses.map((a) => [a.platform, a]));
  const active = byPlatform.get(platform);
  const findings = active?.findings ?? [];
  const lowOf = (a?: AdMateAnalysis) => (a?.findings ?? []).filter((f) => f.performance === "Low").length;

  const tally = PERFORMANCE_ORDER.map((p) => ({
    perf: p,
    count: findings.filter((f) => f.performance === p).length,
  }));
  const spend = findings.reduce((s, f) => s + f.spend, 0);

  const risky = findings
    .filter((f) => f.exposure.kind === "budget_at_risk" && f.exposure.amount > 0)
    .sort((a, b) => b.exposure.amount - a.exposure.amount);
  const riskTotal = risky.reduce((s, f) => s + f.exposure.amount, 0);

  return (
    <section aria-labelledby="camp-title">
      <div className="view-head">
        <h1 className="view-title" id="camp-title">
          Which campaigns are earning their budget
        </h1>
        <p className="view-sub">
          {brandMeta(brand).label} · last 7 complete days. Every campaign is graded on the metric its
          objective was actually bought against — not one blended number. Click a row for the full
          signal, why and action.
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label={`${brandMeta(brand).label} connected platforms`}>
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
              {platformMeta(p).label}
              <span className="tab-count">
                {n}
                {low ? ` · ${low} need attention` : ""}
              </span>
            </button>
          );
        })}
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
                  <h2 className="panel-title">{list[0].objectiveLabel}</h2>
                  <span className="panel-note">{money(famSpend)} · {list.length} campaigns</span>
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
                <strong>No {platformMeta(platform).label} campaigns in this view</strong>
                Switch platform tab to see others.
              </div>
            </div>
          ) : null}
        </div>

        <aside className="panel risk-panel" aria-label="Budget at risk">
          <div className="panel-head">
            <h2 className="panel-title">Budget at risk</h2>
            <span className="panel-note">{riskTotal > 0 ? `${money(riskTotal)} below target` : ""}</span>
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
                    {f.objectiveLabel.toLowerCase()} — {f.primaryMetric} {f.primaryMetricValue}
                    {f.targetOrBaseline ? ` against ${f.targetOrBaseline}` : ""}, {money(f.spend)} spent
                  </p>
                  <p className="risk-a">{f.aiRecommendedAction ?? f.action}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <strong>Nothing below target</strong>
              Every graded campaign with a defensible dollar target is hitting it. Upper-funnel
              campaigns are tracked by spend exposure, not invented dollar loss.
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
      <tr className="camp-row" data-open={open} onClick={onToggle}>
        <td>
          <span className="camp-name">
            <ChevronRight size={14} aria-hidden="true" className="camp-caret" />
            {f.campaignName}
          </span>
          <span className="camp-sub">{f.campaignStateLabel} · {f.signal}</span>
        </td>
        <td>
          {money(f.spend)}
        </td>
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
                            {e.changePct === null ? "—" : `${e.changePct > 0 ? "+" : ""}${e.changePct.toFixed(1)}%`}
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
