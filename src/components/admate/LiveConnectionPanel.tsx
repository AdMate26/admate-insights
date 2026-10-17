import { CircleAlert, CircleCheck } from "lucide-react";

import type { LiveConnection } from "@/lib/live-connection";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Status of the owner's live Meta connection: which account was read, how many
 * campaigns it has and how many delivered in the analysis window — or a safe,
 * human-readable error. Shown above the dashboard views for a live brand.
 */
export function LiveConnectionPanel({ connection }: { connection: LiveConnection }) {
  if (connection.status === "error") {
    return (
      <section className="panel mb-4" role="alert" aria-label="Meta connection">
        <div className="flex items-start gap-3">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              We couldn&apos;t load your Meta ad account
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{connection.error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  const { account, totalCampaigns, deliveringCampaigns, window } = connection;
  const details = [`ID ${account.id}`, account.status, account.currency, account.timezone].filter(
    Boolean,
  );

  return (
    <section className="panel mb-4" aria-label="Meta connection">
      <div className="flex items-start gap-3">
        <CircleCheck size={18} className="mt-0.5 shrink-0 text-positive" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Connected to Meta · {account.name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{details.join(" · ")}</p>
          <p className="mt-2 text-sm text-foreground">
            {totalCampaigns === 0
              ? "No campaigns in this ad account yet."
              : `${totalCampaigns} campaign${totalCampaigns === 1 ? "" : "s"} found · ${deliveringCampaigns} with delivery from ${formatDate(window.since)} to ${formatDate(window.until)}.`}
          </p>
          {deliveringCampaigns === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              There&apos;s nothing to analyse yet. AdMate will grade campaigns here once they start
              delivering — no sample data is shown for this account.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Live data · read-only access · AI explanations are off for live data for now.
          </p>
        </div>
      </div>
    </section>
  );
}
