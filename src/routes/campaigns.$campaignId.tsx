import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdMateHeader } from "@/components/admate/AdMateHeader";
import {
  ConfidenceBadge,
  PerformanceBadge,
  PriorityBadge,
  SignalBadge,
} from "@/components/admate/badges";
import { previewBriefing, sendTelegramBriefing } from "@/lib/admate.functions";
import { analysisQueryOptions } from "@/lib/analysis-query";
import { DEFAULT_BRAND, isBrand, resolveBrandPlatform, type Brand } from "@/lib/brands";
import type { CampaignTiming, EvidenceRow } from "@/lib/analysis/engine";
import { platformMeta, type Platform } from "@/lib/platforms";

export const Route = createFileRoute("/campaigns/$campaignId")({
  validateSearch: (search: Record<string, unknown>): { brand: Brand; platform: Platform } => {
    const brand = isBrand(search.brand) ? search.brand : DEFAULT_BRAND;
    return { brand, platform: resolveBrandPlatform(brand, search.platform) };
  },
  loaderDeps: ({ search }) => ({ brand: search.brand, platform: search.platform }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(analysisQueryOptions(deps.brand, deps.platform));
  },
  head: () => ({
    meta: [
      { title: "Campaign analysis — AdMate" },
      {
        name: "description",
        content:
          "Objective-aware analysis of one campaign: performance, the analytical signal, why, the recommended action and the evidence behind it.",
      },
    ],
  }),
  component: CampaignAnalysis,
});

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3 className="eyebrow">{label}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChangeCell({ metric }: { metric: EvidenceRow }) {
  if (metric.changePct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={metric.direction === "flat" ? "text-muted-foreground" : "text-foreground"}>
      {metric.changePct > 0 ? "+" : ""}
      {metric.changePct.toFixed(1)}%
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function CampaignTimingCard({ timing }: { timing: CampaignTiming }) {
  const fmt = (iso: string | null) =>
    iso
      ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : "—";
  const remaining =
    timing.endDate === null
      ? "Ongoing"
      : timing.daysRemaining === null
        ? "—"
        : timing.daysRemaining < 0
          ? "Ended"
          : `${timing.daysRemaining} ${timing.daysRemaining === 1 ? "day" : "days"}`;
  return (
    <div className="summary-grid">
      <Fact label="Start date" value={fmt(timing.startDate)} />
      <Fact label="End date" value={timing.endDate ? fmt(timing.endDate) : "No end date"} />
      <Fact label="Days remaining" value={remaining} />
    </div>
  );
}

function CampaignAnalysis() {
  const { campaignId } = Route.useParams();
  const { brand, platform } = Route.useSearch();
  const { data } = useSuspenseQuery(analysisQueryOptions(brand, platform));
  const finding = data.findings.find((f) => f.campaignId === campaignId);
  if (!finding) throw notFound();

  const [chatId, setChatId] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const result = await previewBriefing({ data: { brand } });
      setPreview(result.text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      const result = await sendTelegramBriefing({ data: { chatId, brand } });
      if (result.ok) toast.success("Briefing sent to Telegram");
      else toast.error(result.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send briefing");
    } finally {
      setSending(false);
    }
  }

  const setupParts = [
    finding.optimizationGoal,
    finding.campaignType,
    finding.bidStrategy,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-background">
      <AdMateHeader back={{ label: "All campaigns" }} platform={platform} />
      <main className="admate-container detail-page">
        <div className="detail-heading">
          <p className="eyebrow">
            {platformMeta(platform).label} / {finding.objectiveLabel}
          </p>
          <h1>{finding.campaignName}</h1>
          <p className="page-description">{finding.signal}</p>
        </div>

        <div className="detail-top-grid">
          <div className="detail-diagnosis">
            <div className="performance-summary">
              <div>
                <p className="eyebrow">Performance</p>
                <div className="mt-3">
                  <PerformanceBadge performance={finding.performance} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Judged on {finding.primaryMetric} — the KPI this objective was bought against.
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow">{finding.primaryMetric}</p>
                <p className="detail-score">{finding.primaryMetricValue}</p>
                {finding.targetOrBaseline ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{finding.targetOrBaseline}</p>
                ) : null}
              </div>
            </div>
            <div className="detail-meta">
              <PriorityBadge tier={finding.priorityTier} />
              <ConfidenceBadge confidence={finding.diagnosticConfidence} />
            </div>

            <Section label="What AdMate detected">
              <SignalBadge signal={finding.signal} />
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{finding.why}</p>
            </Section>

            <Section label="Possible explanation">
              <p className="text-sm leading-relaxed">
                {finding.aiExplanation ?? finding.why}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {finding.aiExplanation
                  ? "Rephrased by AI from the structured analysis above — no facts added."
                  : "AI narrative unavailable; showing the deterministic diagnosis."}
              </p>
            </Section>
          </div>

          <div className="action-column">
            <section className="recommendation-panel">
              <h3 className="eyebrow text-primary">Recommended action</h3>
              <p className="mt-3 text-xl font-medium leading-snug tracking-tight text-foreground">
                {finding.aiRecommendedAction ?? finding.action}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {finding.exposure.label}:{" "}
                {finding.exposure.amount.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                })}{" "}
                · {finding.priorityTier} priority · {finding.diagnosticConfidence} confidence
              </p>
            </section>

            <section className="key-evidence" aria-label="Key evidence">
              <h3 className="eyebrow">Key evidence</h3>
              {finding.evidence
                .filter((m) => m.primary)
                .map((m) => (
                  <div key={m.label} className="key-metric">
                    <span>{m.label}</span>
                    <strong>{m.current}</strong>
                    <p>
                      Previously {m.previous}{" "}
                      <span>
                        · <ChangeCell metric={m} />
                      </span>
                    </p>
                  </div>
                ))}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {finding.comparisonLabel}
                {finding.targetOrBaseline ? ` · ${finding.targetOrBaseline}` : ""}
              </p>
            </section>
          </div>
        </div>

        <div className="detail-facts-grid">
          <section>
            <h2 className="eyebrow mb-4">Campaign setup</h2>
            <div className="summary-grid">
              <Fact label="Objective" value={`${finding.objectiveLabel}`} />
              <Fact label="Optimized for" value={finding.optimizationGoal ?? finding.objective} />
              <Fact
                label={finding.campaignType ? "Campaign type" : "Bid strategy"}
                value={finding.campaignType ?? finding.bidStrategy ?? "—"}
              />
              <Fact label="State" value={finding.campaignStateLabel} />
            </div>
          </section>
          <section>
            <h2 className="eyebrow mb-4">Campaign timing</h2>
            <CampaignTimingCard timing={finding.timing} />
          </section>
        </div>

        <div className="detail-evidence-grid">
          <details className="evidence-disclosure" open>
            <summary>
              Evidence behind the judgment <span>Objective-aware metrics</span>
            </summary>
            <Section label="Detailed evidence">
              <p className="text-xs text-muted-foreground">
                Current window {data.currentWindow.start} → {data.currentWindow.end} vs prior{" "}
                {data.previousWindow.start} → {data.previousWindow.end}. Compared against{" "}
                {finding.comparisonLabel.toLowerCase()}.
              </p>
              <div className="evidence-table-wrap">
                <table className="evidence-table">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Metric</th>
                      <th className="px-3 py-2 text-right font-medium">Current 7d</th>
                      <th className="px-3 py-2 text-right font-medium">Prior 7d</th>
                      <th className="px-3 py-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finding.evidence.map((m) => (
                      <tr
                        key={m.label}
                        className={`border-b border-border/60 last:border-0 ${m.primary ? "bg-muted/30" : ""}`}
                      >
                        <td className="px-3 py-2 text-foreground">
                          {m.label}
                          {m.primary ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                              primary KPI
                            </span>
                          ) : null}
                          {m.meaning ? (
                            <span className="block text-[11px] text-muted-foreground">{m.meaning}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                          {m.current}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {m.previous}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          <ChangeCell metric={m} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </details>
          <div className="confidence-panel">
            <Section label="How this was judged">
              <ConfidenceBadge confidence={finding.diagnosticConfidence} />
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-muted-foreground/60">•</span>
                  <span>Graded on {finding.primaryMetric}, the KPI for a {finding.objectiveLabel.toLowerCase()} objective.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-muted-foreground/60">•</span>
                  <span>Compared against {finding.comparisonLabel.toLowerCase()}.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-muted-foreground/60">•</span>
                  <span>{finding.campaignStateLabel} — confidence {finding.diagnosticConfidence}.</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Performance, signal and priority are computed in code. AI never sets the verdict, the
                cause, a target or a metric — it only rephrases the explanation and action.
              </p>
            </Section>
          </div>
        </div>

        <div className="telegram-panel">
          <Section label="Telegram briefing">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Telegram chat ID (optional)"
                aria-label="Telegram chat ID (optional)"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={send}
                disabled={sending}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send briefing to Telegram"}
              </button>
              <button
                onClick={loadPreview}
                disabled={loadingPreview}
                className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {loadingPreview ? "Building…" : preview ? "Refresh preview" : "Preview briefing"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The briefing spans all platforms and lists every campaign whose performance is Low, plus
              any tracking problems — the same analysis shown here. Telegram is not connected yet; use
              the preview to review the exact message.
            </p>
            {preview ? (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
                {preview}
              </pre>
            ) : null}
          </Section>
        </div>
      </main>
    </div>
  );
}
