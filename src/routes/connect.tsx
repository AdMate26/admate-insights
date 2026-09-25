import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Connect TikTok Ads — AdMate" },
      {
        name: "description",
        content:
          "Connect your own TikTok Ads account to AdMate. Live account connection is coming soon; the synthetic demo dataset is available today.",
      },
      { property: "og:title", content: "Connect TikTok Ads — AdMate" },
      {
        property: "og:description",
        content: "Live TikTok Ads account connection for AdMate is coming soon.",
      },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link
            to="/"
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to data source
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Connect TikTok Ads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your own ad account data in AdMate.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm font-medium text-foreground">Live connection not available yet</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            AdMate's data layer is built behind a provider contract, so a live TikTok Ads provider
            can be plugged in without changing the analysis engine, the AI layer or this UI. Until
            the live provider is enabled, you can review the full analysis experience on the
            synthetic dataset.
          </p>
          <Link
            to="/demo"
            className="mt-5 inline-flex rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Explore demo instead
          </Link>
        </div>
      </main>
    </div>
  );
}
