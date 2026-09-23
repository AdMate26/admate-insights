import { Plug, LineChart, Rocket } from "lucide-react";

const STEPS = [
  {
    icon: Plug,
    title: "Connect",
    body: "Connect the advertising accounts you want AdMate to monitor.",
  },
  {
    icon: LineChart,
    title: "Analyze",
    body: "AdMate evaluates each campaign based on the metrics relevant to its objective.",
  },
  {
    icon: Rocket,
    title: "Act",
    body: "See what is performing strongly, what needs attention, and what action to take next.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-border/70 bg-surface-subtle">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-muted-foreground">
            Three steps from connected accounts to a clear next action.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <step.icon size={18} />
                </span>
                <span className="font-mono text-sm text-muted-foreground">{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
