import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { AdMateHeader } from "@/components/admate/AdMateHeader";
import { SeverityBadge, StatusBadge } from "@/components/admate/badges";
import { analysisQueryOptions } from "@/lib/analysis-query";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(analysisQueryOptions),
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

const currency = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function CampaignList() {
  const { data } = useSuspenseQuery(analysisQueryOptions);
  const attention = data.findings.filter((f) => f.needsAttention).length;

  return (
    <div className="min-h-screen bg-background">
      <AdMateHeader />

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
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="px-4 py-3 text-right font-medium">Conversions</th>
                <th className="px-4 py-3 text-right font-medium">Cost / result</th>
              </tr>
            </thead>
            <tbody>
              {data.findings.map((f) => (
                <tr key={f.campaignId} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: f.campaignId }}
                      className="block font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {f.campaignName}
                    </Link>
                    <span className="mt-1 block">
                      <SeverityBadge severity={f.severity} />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge signal={f.signal} label={f.statusLabel} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {currency(f.snapshot.spend)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {f.snapshot.ctr.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {f.snapshot.conversions.toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {f.snapshot.cpa > 0 ? currency(f.snapshot.cpa) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Metrics, status, priority and confidence are computed in code. AI writes only the possible
          explanation and recommended action shown inside each campaign analysis.
        </p>
      </main>
    </div>
  );
}
