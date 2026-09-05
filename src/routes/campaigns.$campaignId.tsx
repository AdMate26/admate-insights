import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdMateHeader } from "@/components/admate/AdMateHeader";
import {
  PerformanceBadge,
  ConfidenceBadge,
  SeverityBadge,
  SignalBadge,
} from "@/components/admate/badges";
import { previewBriefing, sendTelegramBriefing } from "@/lib/admate.functions";
import { analysisQueryOptions } from "@/lib/analysis-query";
import type { CampaignTiming, MetricComparison, PerformanceRating } from "@/lib/analysis/engine";
import { DEFAULT_PLATFORM, isPlatform, platformMeta, type Platform } from "@/lib/platforms";

export const Route = createFileRoute("/campaigns/$campaignId")({
  validateSearch: (search: Record<string, unknown>): { platform: Platform } => ({
    platform: isPlatform(search.platform) ? search.platform : DEFAULT_PLATFORM,
  }),
  loaderDeps: ({ search }) => ({ platform: search.platform }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(analysisQueryOptions(deps.platform));
  },
  head: () => ({
    meta: [
      { title: "Campaign analysis — AdMate" },
      {
        name: "description",
        content:
          "Status, what changed, possible explanation, recommended action, evidence and confidence for a single TikTok Ads campaign.",
      },
      { property: "og:title", content: "Campaign analysis — AdMate" },
      {
        property: "og:description",
        content:
          "One TikTok Ads campaign: deterministic status and evidence, with an AI-written explanation and recommended action.",
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

function ChangeCell({ metric }: { metric: MetricComparison }) {
  if (metric.changePct === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    metric.direction === "flat"
      ? "text-muted-foreground"
      : metric.direction === "up"
        ? "text-foreground"
        : "text-foreground";
  return (
    <span className={tone}>
      {metric.changePct > 0 ? "+" : ""}
      {metric.changePct.toFixed(1)}%
    </span>
  );
}

/** Prominent, customer-facing Performance Score + rating shown near the top. */
function PerformanceHeader({
  rating,
  score,
  label,
  note,
}: {
  rating: PerformanceRating | null;
  score: number | null;
  label: string;
  note: string;
}) {
  const hasScore = score !== null;

  return (
    <div className="performance-summary">
      <div>
        <p className="eyebrow">Performance</p>
        <div className="mt-3">
          <PerformanceBadge rating={rating} label={label} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="text-right">
        <p className="eyebrow">Score</p>
        <p className="detail-score">{hasScore ? score : "—"}</p>
        {hasScore ? <p className="mt-1 text-[11px] text-muted-foreground">out of 100</p> : null}
      </div>
    </div>
  );
}

/** Informational campaign timing: start, end and days remaining / ongoing. */
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
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Start date
        </p>
        <p className="mt-2 font-mono text-sm text-foreground">{fmt(timing.startDate)}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          End date
        </p>
        <p className="mt-2 font-mono text-sm text-foreground">
          {timing.endDate ? fmt(timing.endDate) : "No end date"}
        </p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Days remaining
        </p>
        <p className="mt-2 font-mono text-sm text-foreground">{remaining}</p>
      </div>
    </div>
  );
}

/** Current 7d spend, previous 7d spend and the % change, from the Spend evidence row. */
function SpendSummary({ metric }: { metric?: MetricComparison }) {
  if (!metric) return null;
  const changeTone =
    metric.changePct === null
      ? "text-muted-foreground"
      : metric.changePct > 0
        ? "text-foreground"
        : metric.changePct < 0
          ? "text-foreground"
          : "text-muted-foreground";
  return (
    <div className="summary-grid">
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Current 7d spend
        </p>
        <p className="mt-2 font-mono text-base font-medium text-foreground">{metric.current}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Previous 7d spend
        </p>
        <p className="mt-2 font-mono text-base text-muted-foreground">{metric.previous}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          % change
        </p>
        <p className={`mt-2 font-mono text-base ${changeTone}`}>
          {metric.changePct === null
            ? "—"
            : `${metric.changePct > 0 ? "+" : ""}${metric.changePct.toFixed(1)}%`}
        </p>
      </div>
    </div>
  );
}

function CampaignAnalysis() {
  const { campaignId } = Route.useParams();
  const { platform } = Route.useSearch();
  const { data } = useSuspenseQuery(analysisQueryOptions(platform));
  const finding = data.findings.find((f) => f.campaignId === campaignId);
  if (!finding) throw notFound();

  const [chatId, setChatId] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const result = await previewBriefing();
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
      const result = await sendTelegramBriefing({ data: { chatId } });
      if (result.ok) toast.success("Briefing sent to Telegram");
      else toast.error(result.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send briefing");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AdMateHeader back={{ label: "All campaigns" }} platform={platform} />
      <main className="admate-container detail-page">
        <div className="detail-heading">
          <p className="eyebrow">{platformMeta(platform).label} / Campaign analysis</p>
          <h1>{finding.campaignName}</h1>
          <p className="page-description">{finding.headline}</p>
        </div>
        <div className="detail-top-grid">
          <div className="detail-diagnosis">
            <PerformanceHeader
              rating={finding.performanceRating}
              score={finding.performanceScore}
              label={finding.performanceLabel}
              note={
                finding.performanceScore !== null
                  ? "Deterministic score from performance change — spend and confidence excluded."
                  : finding.whyItMatters
              }
            />
            <div className="detail-meta">
              <SeverityBadge severity={finding.severity} />
              <ConfidenceBadge confidence={finding.confidence} />
            </div>
            <Section label="What AdMate detected">
              <SignalBadge signal={finding.signal} label={finding.signalLabel} />
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {finding.statusReason}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {finding.whyItMatters}
              </p>
            </Section>
            <Section label="What changed">
              <p className="text-sm leading-relaxed">{finding.whatChanged}</p>
            </Section>
            <Section label="Possible explanation">
              <p className="text-sm leading-relaxed">
                {finding.aiExplanation ?? "AI narrative unavailable for this finding."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Written by Lovable AI from the structured finding above.
              </p>
            </Section>
          </div>
          <div className="action-column">
            {finding.guidance ? (
              <section className="recommendation-panel">
                <h3 className="eyebrow text-primary">Recommended action</h3>
                {finding.guidance.directionNote ? (
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    {finding.guidance.directionNote}
                  </p>
                ) : null}
                <p className="mt-3 text-xl font-medium leading-snug tracking-tight text-foreground">
                  {finding.guidance.action}
                </p>
                {finding.guidance.steps ? (
                  <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
                    {finding.guidance.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                ) : null}
                <p className="mt-4 text-xs text-muted-foreground">
                  Deterministic guidance for a data-confidence case · priority {finding.severity} ·{" "}
                  {finding.confidence} confidence (computed in code)
                </p>
              </section>
            ) : (
              <section className="recommendation-panel">
                <h3 className="eyebrow text-primary">Recommended action</h3>
                <p className="mt-3 text-xl font-medium leading-snug tracking-tight text-foreground">
                  {finding.aiRecommendedAction ??
                    "AI narrative unavailable — review the evidence below before acting."}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Suggested by Lovable AI · priority {finding.severity} · {finding.confidence}{" "}
                  confidence (both computed in code)
                </p>
              </section>
            )}
            <section className="key-evidence" aria-label="Key evidence">
              <h3 className="eyebrow">Key evidence</h3>
              {finding.evidence.metrics
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
                {finding.evidence.currentWindow} vs {finding.evidence.previousWindow}
              </p>
            </section>
          </div>
        </div>
        <div className="detail-facts-grid">
          <section>
            <h2 className="eyebrow mb-4">Spend comparison</h2>
            <SpendSummary metric={finding.evidence.metrics.find((m) => m.label === "Spend")} />
          </section>
          <section>
            <h2 className="eyebrow mb-4">Campaign timing</h2>
            <CampaignTimingCard timing={finding.timing} />
            <p className="mt-3 text-sm text-muted-foreground">{finding.timing.label}</p>
          </section>
        </div>
        <div className="detail-evidence-grid">
          <details className="evidence-disclosure" open>
            <summary>
              Evidence behind the judgment <span>Metrics & comparison method</span>
            </summary>
            <Section label="Detailed evidence">
              <p className="text-xs text-muted-foreground">
                Current window {finding.evidence.currentWindow} vs prior window{" "}
                {finding.evidence.previousWindow}
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
                    {finding.evidence.metrics.map((m) => (
                      <tr
                        key={m.label}
                        className={`border-b border-border/60 last:border-0 ${m.primary ? "bg-muted/30" : ""}`}
                      >
                        <td className="px-3 py-2 text-foreground">
                          {m.label}
                          {m.primary ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                              trigger
                            </span>
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
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {finding.evidence.method}
              </p>
            </Section>
          </details>
          <div className="confidence-panel">
            <Section label="Confidence">
              <ConfidenceBadge confidence={finding.confidence} />
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {finding.confidenceBasis.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-muted-foreground/60">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Confidence score {finding.confidenceScore} — assigned by the deterministic engine
                from volume, consistency, magnitude and data completeness. AI does not influence it.
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
              Sends the top priority findings and their recommended actions as a formatted digest.
              Telegram is not connected yet — use the preview to review the exact message.
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
