import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AdMate — AI Marketing Analyst for TikTok Ads" },
      {
        name: "description",
        content:
          "Start with AdMate's synthetic TikTok Ads demo data, or connect your own TikTok Ads account when the live connection is available.",
      },
      { property: "og:title", content: "AdMate — AI Marketing Analyst for TikTok Ads" },
      {
        property: "og:description",
        content: "Explore the AdMate demo or connect your own TikTok Ads account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AdMate</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI Marketing Analyst Platform</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h2 className="text-base font-semibold text-foreground">Welcome to AdMate</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your data source. No account needed — you can switch later. Analysis, evidence and
          confidence work the same in both modes.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            to="/home"
            className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Demo Mode — Synthetic TikTok Ads Data
            </span>
            <span className="mt-2 text-lg font-semibold text-foreground">Explore Demo</span>
            <span className="mt-2 text-sm text-muted-foreground">
              Use the existing synthetic TikTok Ads dataset and see the full AdMate analysis
              experience across nine representative campaign cases.
            </span>
            <span className="mt-4 text-sm font-medium text-foreground underline-offset-4 group-hover:underline">
              Open demo analysis →
            </span>
          </Link>

          <Link
            to="/connect"
            className="group flex flex-col rounded-lg border border-dashed border-border bg-background p-5 transition-colors hover:border-foreground/30"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live data — coming soon
            </span>
            <span className="mt-2 text-lg font-semibold text-foreground">Connect TikTok Ads</span>
            <span className="mt-2 text-sm text-muted-foreground">
              For users who want to use their own TikTok Ads account, once the live connection is
              available.
            </span>
            <span className="mt-4 text-sm font-medium text-muted-foreground group-hover:underline">
              See details →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
