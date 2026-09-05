import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { AdMateHeader } from "@/components/admate/AdMateHeader";
import { ConfidenceBadge, PerformanceBadge, SeverityBadge, SignalBadge } from "@/components/admate/badges";
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
      { title: "AdMate — AI Marketing Analyst for TikTok Ads" },
      {
        name: "description",
        content:
          "AdMate reviews TikTok Ads campaigns and tells you what changed, what needs attention, why, and the recommended action — with deterministic evidence and confidence.",
      },
      { property: "og:title", content: "AdMate — AI Marketing Analyst for TikTok Ads" },
      {
        property: "og:description",
        content:
          "Campaign findings, evidence and recommended actions for TikTok Ads, computed deterministically and explained in plain language.",
      },
    ],
  }),
  component: CampaignList,
});


function CampaignList() {
  const { platform } = Route.useSearch();
  const { data } = useSuspenseQuery(analysisQueryOptions(platform));
  // Count comes ONLY from Performance Rating = Needs Attention (single source of
  // truth) — never from priority/severity/Check Data/Early Data/Fair/Good.
  const attention = needsAttentionCount(data.findings);

  return (
    <div className="min-h-screen bg-background">
      <AdMateHeader platform={platform} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest 7 complete days ({data.currentWindow.start} → {data.currentWindow.end}) compared
              with {data.previousWindow.start} → {data.previousWindow.end}.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{attention}</span> of{" "}
            {data.findings.length} need attention
          </p>
        </div>

        {data.aiStatus === "failed" ? (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            AI narratives unavailable: {data.aiError}. Deterministic findings, evidence and
            confidence below are unaffected.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Campaign</th>
                <th className="px-4 py-3 text-left font-medium">Performance</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
                <th className="px-4 py-3 text-left font-medium">Signal</th>
                <th className="px-4 py-3 text-left font-medium">Confidence</th>
                <th className="px-4 py-3 text-right font-medium">Spend (7d)</th>
                <th className="px-4 py-3 text-left font-medium">Timing</th>
                <th className="px-4 py-3 text-left font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.findings.map((f) => (
                <tr key={f.campaignId} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: f.campaignId }}
                      search={{ platform }}
                      className="block font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {f.campaignName}
                    </Link>
                    <span className="mt-1 block">
                      <SeverityBadge severity={f.severity} />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PerformanceBadge rating={f.performanceRating} label={f.performanceLabel} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                    {f.performanceScore ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <SignalBadge signal={f.signal} label={f.signalLabel} />
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge confidence={f.confidence} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {f.snapshot.spend.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {f.timing.label}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    {f.statusReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Performance score, signal, priority and confidence are all derived by the deterministic rule
          engine from the normalized metrics — no labels are hard-coded per campaign, and spend never
          moves the score. AI writes only the possible explanation and recommended action shown inside
          each campaign analysis.
        </p>
      </main>
    </div>
  );
}
