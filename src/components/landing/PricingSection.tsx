import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-border/70 bg-surface-subtle">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Pricing</h2>
          <p className="mt-3 text-muted-foreground">
            Early Access is available now. Pro and Agency plans are on the way.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-5 md:grid-cols-3">
          {/* EARLY ACCESS — the only available, priced plan */}
          <div className="relative rounded-2xl border-2 border-primary bg-card p-6 shadow-lg shadow-primary/10">
            <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              Available
            </span>
            <h3 className="text-lg font-semibold text-foreground">Early Access</h3>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-foreground">$5</span>
              <span className="text-sm text-muted-foreground">Early Access</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              For marketers starting with AdMate and managing a small number of brands.
            </p>

            <ul className="mt-5 space-y-2 text-sm text-foreground">
              {[
                "1–2 brands",
                "Meta / TikTok / Google",
                "AI campaign recommendations",
                "High & low performance alerts",
                "Telegram briefing",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-positive" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button asChild className="mt-6 w-full">
              <Link to="/signup">Join Early Access — $5</Link>
            </Button>
          </div>

          {/* PRO — coming soon, no price */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              Coming Soon
            </span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">Pro</h3>
            <p className="mt-3 text-sm text-muted-foreground">Possible future features:</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {["More brands", "Advanced alerts", "Longer history", "More automation"].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" variant="outline" disabled>
              Coming Soon
            </Button>
          </div>

          {/* AGENCY — coming soon, no price */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              Coming Soon
            </span>
            <h3 className="mt-3 text-lg font-semibold text-foreground">Agency</h3>
            <p className="mt-3 text-sm text-muted-foreground">Possible future features:</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {[
                "Multiple client brands",
                "Team access",
                "Client reporting",
                "Agency workspace",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" variant="outline" disabled>
              Coming Soon
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
