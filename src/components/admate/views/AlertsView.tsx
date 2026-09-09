import { PerformanceBadge, SignalBadge } from "@/components/admate/badges";
import type { AdMateAnalysis } from "@/lib/admate.functions";
import { platformMeta, type Platform } from "@/lib/platforms";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function AlertsView({
  analyses,
  onOpenCampaigns,
}: {
  analyses: AdMateAnalysis[];
  onOpenCampaigns: (p: Platform) => void;
}) {
  const alerts = analyses
    .flatMap((a) => a.findings)
    .filter((f) => f.performance === "Low" || f.performance === "Error")
    .sort((a, b) => b.priority - a.priority);

  return (
    <section aria-labelledby="al-title">
      <div className="view-head">
        <h1 className="view-title" id="al-title">
          What needs action, and what to do about it
        </h1>
        <p className="view-sub">
          Only campaigns AdMate can judge with enough evidence and finds materially underperforming
          (Low), plus real tracking/data problems (Error). In Review campaigns are held back until
          they stabilize.
        </p>
      </div>

      {alerts.length ? (
        <div className="alert-list">
          {alerts.map((f) => (
            <div className="panel alert-item" key={f.campaignId}>
              <div className="alert-item-head">
                <div>
                  <p className="alert-name">{f.campaignName}</p>
                  <p className="alert-meta">
                    {platformMeta(f.platform).label} · Campaign Objective: {f.objectiveLabel}
                    {f.campaignType ? ` · ${f.campaignType}` : ""} · {money(f.spend)} spent
                  </p>
                </div>
                <PerformanceBadge performance={f.performance} />
              </div>
              <div className="alert-body">
                <p>
                  <SignalBadge signal={f.signal} />
                </p>
                <p className="alert-why">{f.aiExplanation ?? f.why}</p>
                <p className="alert-action">
                  <strong>Do now:</strong> {f.aiRecommendedAction ?? f.action}
                </p>
                <button className="button-quiet" onClick={() => onOpenCampaigns(f.platform)}>
                  View in campaigns
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <div className="empty">
            <strong>All clear</strong>
            No campaign is currently rated Low and there are no tracking errors.
          </div>
        </div>
      )}
    </section>
  );
}
