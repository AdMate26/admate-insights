import { ArrowUpRight } from "lucide-react";

import { StatusPill } from "@/components/admate/badges";
import type { AdMateAnalysis } from "@/lib/admate.functions";
import type { CampaignFinding, Performance } from "@/lib/analysis/engine";
import { platformMeta, type Platform } from "@/lib/platforms";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const WORST_ORDER: Performance[] = ["Error", "Low", "Moderate", "In Review", "High"];
function worstPerformance(findings: CampaignFinding[]): Performance {
  for (const p of WORST_ORDER) if (findings.some((f) => f.performance === p)) return p;
  return "High";
}

export function OverviewView({
  analyses,
  onOpenCampaigns,
  onOpenBriefings,
}: {
  analyses: AdMateAnalysis[];
  onOpenCampaigns: (p: Platform) => void;
  onOpenBriefings: () => void;
}) {
  const all = analyses.flatMap((a) => a.findings);
  const totalCampaigns = all.length;
  const needsAttention = all.filter((f) => f.performance === "Low").length;
  const totalSpend = analyses.reduce((s, a) => s + a.totalSpend, 0);
  const budgetAtRisk = all
    .filter((f) => f.exposure.kind === "budget_at_risk")
    .reduce((s, f) => s + f.exposure.amount, 0);

  const attention = all
    .filter((f) => f.performance === "Low" || f.performance === "Error")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  return (
    <section aria-labelledby="ov-title">
      <div className="view-head">
        <h1 className="view-title" id="ov-title">
          Every ad account in one live view
        </h1>
        <p className="view-sub">
          Meta, TikTok and Google — each campaign judged on the KPI its objective was bought against,
          compared to its target, its own baseline or comparable campaigns.
        </p>
      </div>

      <dl className="kpi-strip" aria-label="Portfolio KPIs">
        <div>
          <dt>Campaigns</dt>
          <dd>{totalCampaigns}</dd>
          <span>across 3 platforms</span>
        </div>
        <div>
          <dt>Needs attention</dt>
          <dd className="kpi-crit">{needsAttention}</dd>
          <span>performance rated Low</span>
        </div>
        <div>
          <dt>Spend (7 days)</dt>
          <dd>{money(totalSpend)}</dd>
          <span>all platforms</span>
        </div>
        <div>
          <dt>Budget at risk</dt>
          <dd>{budgetAtRisk > 0 ? money(budgetAtRisk) : "—"}</dd>
          <span>below defensible targets</span>
        </div>
      </dl>

      <div className="overview-grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Accounts</h2>
            <span className="panel-note">Click a platform to open its campaigns</span>
          </div>
          <div className="ledger-wrap">
            <table className="ledger accounts-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Campaigns</th>
                  <th>Spend (7d)</th>
                  <th>Needs attention</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => {
                  const low = a.findings.filter((f) => f.performance === "Low").length;
                  return (
                    <tr key={a.platform} className="camp-row" onClick={() => onOpenCampaigns(a.platform)}>
                      <td>
                        <span className="camp-name">
                          <span className={`dot dot--${a.platform}`} aria-hidden="true" />
                          {platformMeta(a.platform).label}
                        </span>
                      </td>
                      <td>{a.findings.length}</td>
                      <td>{money(a.totalSpend)}</td>
                      <td>{low}</td>
                      <td>
                        <StatusPill performance={worstPerformance(a.findings)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Needs your attention</h2>
            <span className="panel-note">{attention.length} flagged</span>
          </div>
          {attention.length ? (
            <div className="attn-list">
              {attention.map((f) => (
                <button
                  key={f.campaignId}
                  className="attn-item"
                  onClick={() => onOpenCampaigns(f.platform)}
                >
                  <div className="attn-top">
                    <span className="attn-name">{f.campaignName}</span>
                    <StatusPill performance={f.performance} />
                  </div>
                  <p className="attn-sig">
                    {platformMeta(f.platform).label} · {f.objectiveLabel} — {f.signal}
                  </p>
                  <p className="attn-act">{f.aiRecommendedAction ?? f.action}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              <strong>Nothing needs attention</strong>
              Every judged campaign is on track for its objective.
            </div>
          )}
        </div>
      </div>

      <div className="panel next-briefing">
        <div className="panel-head">
          <h2 className="panel-title">Next briefing</h2>
          <span className="panel-note">Cross-platform · Telegram</span>
        </div>
        <div className="next-briefing-body">
          <p>
            The next briefing summarizes every campaign whose performance is Low, plus tracking
            issues — the same analysis shown here. High and Moderate campaigns are omitted to keep it
            scannable.
          </p>
          <button className="button-secondary" onClick={onOpenBriefings}>
            Open briefings <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
