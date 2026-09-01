import { Link } from "@tanstack/react-router";

type Props = {
  /** Optional back link shown on the analysis view. */
  back?: { label: string };
};

export function AdMateHeader({ back }: Props) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {back ? (
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {back.label}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AdMate</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI Marketing Analyst Platform</p>
        </div>
        <dl className="flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
            <dt className="uppercase tracking-wide text-muted-foreground">Platform</dt>
            <dd className="font-medium text-foreground">TikTok Ads</dd>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
            <dt className="uppercase tracking-wide text-muted-foreground">Mode</dt>
            <dd className="font-medium text-foreground">Demo Data</dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
