import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdMateHeader } from "@/components/admate/AdMateHeader";
import { ConfidenceBadge, SeverityBadge, SignalBadge, StatusBadge } from "@/components/admate/badges";
import { previewBriefing, sendTelegramBriefing } from "@/lib/admate.functions";
import { analysisQueryOptions } from "@/lib/analysis-query";
import type { MetricComparison } from "@/lib/analysis/engine";

export const Route = createFileRoute("/campaigns/$campaignId")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(analysisQueryOptions);
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

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </h3>
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

function CampaignAnalysis() {
  const { campaignId } = Route.useParams();
  const { data } = useSuspenseQuery(analysisQueryOptions);
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
      <AdMateHeader back={{ label: "All campaigns" }} />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {finding.campaignName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{finding.headline}</p>
        </div>

        <div className="space-y-6">
          <Section label="Status">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={finding.status} label={finding.statusLabel} />
              <SignalBadge signal={finding.signal} label={finding.signalLabel} />
              <SeverityBadge severity={finding.severity} />
              <span className="text-xs text-muted-foreground">
                {finding.statusReason}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{finding.whyItMatters}</p>
          </Section>

          <Section label="What changed">
            <p className="text-sm leading-relaxed text-foreground">{finding.whatChanged}</p>
          </Section>

          <Section label="Possible explanation">
            <p className="text-sm leading-relaxed text-foreground">
              {finding.aiExplanation ?? "AI narrative unavailable for this finding."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Written by Lovable AI from the structured finding above.</p>
          </Section>

          {/* RECOMMENDED ACTION — the focal point of this view. */}
          <section className="rounded-xl border-2 border-primary/70 bg-primary/5 p-6 shadow-sm">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Recommended action
            </h3>
            <p className="mt-3 text-xl font-medium leading-snug tracking-tight text-foreground">
              {finding.aiRecommendedAction ??
                "AI narrative unavailable — review the evidence below before acting."}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Suggested by Lovable AI · priority {finding.severity} · {finding.confidence} confidence
              (both computed in code)
            </p>
          </section>

          <Section label="Evidence">
            <p className="text-xs text-muted-foreground">
              Current window {finding.evidence.currentWindow} vs prior window{" "}
              {finding.evidence.previousWindow}
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
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
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{m.current}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {m.previous}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
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
              Confidence score {finding.confidenceScore} — assigned by the deterministic engine from
              volume, consistency, magnitude and data completeness. AI does not influence it.
            </p>
          </Section>

          <Section label="Telegram briefing">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Telegram chat ID (optional)"
                className="h-9 min-w-56 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
