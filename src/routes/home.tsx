import { ArrowUpRight, CalendarDays, Info, Layers3 } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { AdMateHeader } from "@/components/admate/AdMateHeader";
import { ConfidenceBadge, PerformanceBadge, PriorityBadge, SignalBadge } from "@/components/admate/badges";
import { analysisQueryOptions } from "@/lib/analysis-query";
import { needsAttentionCount } from "@/lib/attention";
import { DEFAULT_PLATFORM, isPlatform, type Platform } from "@/lib/platforms";

export const Route = createFileRoute("/home")({
  validateSearch: (search: Record<string, unknown>): { platform: Platform } => ({
    platform: isPlatform(search.platform) ? search.platform : DEFAULT_PLATFORM,
  }),
  loaderDeps: ({ search }) => ({ platform: search.platform }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(analysisQueryOptions(deps.platform)),
  head: () => ({
    meta: [
      { title: "AdMate — Platform-aware marketing analyst" },
      {
        name: "description",
        content:
          "AdMate judges every campaign on the metric its objective was bought against, across Meta, TikTok and Google — with the evidence behind every verdict.",
      },
      { property: "og:title", content: "AdMate — Platform-aware marketing analyst" },
      {
        property: "og:description",
        content:
          "Objective-aware campaign analysis: performance, signal, why and action for Meta, TikTok and Google Ads.",
      },
    ],
  }),
  component: CampaignList,
});

function CampaignList() {
  const { platform } = Route.useSearch();
  const { data } = useSuspenseQuery(analysisQueryOptions(platform));
  const attention = needsAttentionCount(data.findings);
  const inReview = data.findings.filter((f) => f.performance === "In Review").length;
  const budgetAtRisk = data.findings
    .filter((f) => f.exposure.kind === "budget_at_risk")
    .reduce((sum, f) => sum + f.exposure.amount, 0);
  const money = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-background">
      <AdMateHeader platform={platform} />
      <main className="admate-container campaign-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Campaign intelligence</p>
            <h1>
              See the signal.
              <br className="mobile-break" /> Know your next move.
            </h1>
            <p className="page-description">
              Every campaign judged on the metric its objective was bought against — with the evidence
              behind each verdict.
            </p>
          </div>
          <div className="date-window">
            <CalendarDays size={16} aria-hidden="true" />
            <div>
              <span>Last 7 complete days</span>
              <strong>
                {data.currentWindow.start} — {data.currentWindow.end}
              </strong>
              <small>
                vs {data.previousWindow.start} — {data.previousWindow.end}
              </small>
            </div>
          </div>
        </div>
        <dl className="overview-grid" aria-label="Performance overview">
          <div>
            <dt>Total Campaigns</dt>
            <dd>{data.findings.length.toString().padStart(2, "0")}</dd>
            <span>In this platform</span>
          </div>
          <div>
            <dt>Needs Attention</dt>
            <dd className="overview-attention">{attention.toString().padStart(2, "0")}</dd>
            <span>Performance rated Low</span>
          </div>
          <div>
            <dt>Spend (Last 7 Days)</dt>
            <dd>{money(data.totalSpend)}</dd>
            <span>Across all campaigns</span>
          </div>
          <div>
            <dt>Budget at Risk</dt>
            <dd>{budgetAtRisk > 0 ? money(budgetAtRisk) : "—"}</dd>
            <span>{inReview} in review this week</span>
          </div>
        </dl>
        {data.aiStatus === "failed" ? (
          <div className="narrative-notice" role="status">
            <Info size={16} aria-hidden="true" />
            <div>
              <strong>AI explanations are currently unavailable.</strong> Performance, signals and
              evidence are still available.
              <details>
                <summary>View details</summary>
                <p>{data.aiError}</p>
              </details>
            </div>
          </div>
        ) : null}
        <section aria-labelledby="campaign-list-title">
          <div className="list-heading">
            <h2 id="campaign-list-title">
              Campaigns <span>{data.findings.length}</span>
            </h2>
            <p>
              <Layers3 size={14} aria-hidden="true" /> Ordered by priority
            </p>
          </div>
          <div className="campaign-columns" aria-hidden="true">
            <span>Campaign</span>
            <span>Performance</span>
            <span>Primary KPI</span>
            <span>Signal</span>
            <span>Confidence</span>
            <span>Spend (7d)</span>
            <span>Timing</span>
          </div>
          <ul className="campaign-list">
            {data.findings.map((f) => (
              <li key={f.campaignId}>
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: f.campaignId }}
                  search={{ platform }}
                  className="campaign-row"
                  aria-label={`View ${f.campaignName}`}
                >
                  <div className="campaign-row-grid">
                    <div className="campaign-name-cell">
                      <h3>
                        {f.campaignName}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </h3>
                      <span className="campaign-objective-line">
                        {f.objectiveLabel}
                        {f.campaignType ? ` · ${f.campaignType}` : f.optimizationGoal ? ` · ${f.optimizationGoal}` : ""}
                      </span>
                      <PriorityBadge tier={f.priorityTier} />
                    </div>
                    <div className="campaign-cell performance-cell">
                      <span className="cell-label">Performance</span>
                      <PerformanceBadge performance={f.performance} />
                    </div>
                    <div className="campaign-cell score-cell">
                      <span className="cell-label">Primary KPI</span>
                      <span className="metric-value">{f.primaryMetricValue}</span>
                      <span className="kpi-sublabel">{f.primaryMetric}</span>
                    </div>
                    <div className="campaign-cell signal-cell">
                      <span className="cell-label">Signal</span>
                      <SignalBadge signal={f.signal} />
                    </div>
                    <div className="campaign-cell confidence-cell">
                      <span className="cell-label">Confidence</span>
                      <ConfidenceBadge confidence={f.diagnosticConfidence} />
                    </div>
                    <div className="campaign-cell spend-cell">
                      <span className="cell-label">Spend (7d)</span>
                      <span className="metric-value">{money(f.spend)}</span>
                    </div>
                    <div className="campaign-cell timing-cell">
                      <span className="cell-label">Timing</span>
                      <span>{f.timing.label}</span>
                    </div>
                  </div>
                  <p className="campaign-reason">
                    <span>Why this judgment</span>
                    {f.why}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <p className="method-note">
          Each campaign is graded on the KPI its objective was bought against, compared to its target,
          its own baseline, or similar campaigns. Performance, signals, priority and confidence are
          computed from your metrics; AI only rephrases the explanation and action.
        </p>
      </main>
    </div>
  );
}
