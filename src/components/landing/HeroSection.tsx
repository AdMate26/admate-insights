import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/** A single verdict tally row in the preview card (HIGH / LOW / ERROR). */
function TallyRow({
  icon,
  label,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2">
      <span className={`flex items-center gap-2 text-xs font-medium tracking-wide ${tone}`}>
        {icon}
        {label}
      </span>
      <span className="font-mono text-sm font-medium text-foreground">{count}</span>
    </div>
  );
}

/** Static, illustrative briefing card — a visual preview only, not live data. */
function BriefingPreview() {
  return (
    <div
      aria-hidden="true"
      className="w-full rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Brand Name</p>
          <p className="text-xs text-muted-foreground">Today's briefing</p>
        </div>
        <span className="rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
          7 days
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <TallyRow icon={<CircleCheck size={13} />} label="HIGH" count={2} tone="text-positive" />
        <TallyRow icon={<CircleAlert size={13} />} label="LOW" count={3} tone="text-primary" />
        <TallyRow
          icon={<TriangleAlert size={13} />}
          label="ERROR"
          count={1}
          tone="text-muted-foreground"
        />
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-positive/30 bg-positive/5 p-3">
          <div className="flex items-center gap-2">
            <CircleCheck size={14} className="text-positive" />
            <p className="text-sm font-medium text-foreground">Advantage+ Shopping</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ROAS is above target. Scale gradually while CPA remains stable.
          </p>
        </div>

        <div className="rounded-xl border border-primary/25 bg-accent p-3">
          <div className="flex items-center gap-2">
            <CircleAlert size={14} className="text-primary" />
            <p className="text-sm font-medium text-foreground">Retargeting – 7d add-to-cart</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Post-click drop-off. Review the landing page before increasing spend.
          </p>
        </div>
      </div>
    </div>
  );
}

const PLATFORMS = [
  { name: "Meta Ads", soon: false },
  { name: "TikTok Ads", soon: false },
  { name: "Google Ads", soon: false },
  { name: "LinkedIn", soon: true },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brand glow behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-6rem] mx-auto h-72 max-w-4xl rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 md:py-24 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-accent px-3 py-1 text-xs font-medium text-primary">
            AI marketing analyst
          </span>

          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            Know what is working.
            <br />
            Know what to do next.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Connect your ad accounts. AdMate monitors performance by campaign objective, finds risks
            and opportunities, and gives you clear actions through the dashboard and Telegram.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/signup">
                Start Early Access
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/demo">View Demo</Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Already have an AdMate account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>

          <div className="mt-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Supported platforms
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground"
                >
                  {p.name}
                  {p.soon ? (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Coming Soon
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <BriefingPreview />
        </div>
      </div>
    </section>
  );
}
