import { CircleAlert, CircleCheck, Send, TriangleAlert } from "lucide-react";

const EXAMPLES = [
  {
    icon: CircleCheck,
    tone: "text-positive",
    ring: "border-positive/30",
    title: "High-performance opportunity",
    body: "Advantage+ Shopping — ROAS above target. Scale gradually while CPA holds.",
  },
  {
    icon: CircleAlert,
    tone: "text-primary",
    ring: "border-primary/25",
    title: "Low-performance alert",
    body: "Retargeting – 7d add-to-cart — post-click drop-off. Review the landing page first.",
  },
  {
    icon: TriangleAlert,
    tone: "text-muted-foreground",
    ring: "border-border",
    title: "Tracking issue",
    body: "Search – Brand — conversions not recording. Check the pixel before judging results.",
  },
];

export function TelegramSection() {
  return (
    <section className="border-t border-border/70">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 md:py-20 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-accent px-3 py-1 text-xs font-medium text-primary">
            <Send size={13} />
            Telegram briefings
          </span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Get campaign briefings where you already are
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
            AdMate can send campaign briefings straight to Telegram — high-performance
            opportunities, low-performance alerts, tracking issues, and the recommended action for
            each — so you can act without opening a dashboard.
          </p>

          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CircleCheck size={15} className="text-positive" /> High-performance opportunities
            </li>
            <li className="flex items-center gap-2">
              <CircleAlert size={15} className="text-primary" /> Low-performance alerts
            </li>
            <li className="flex items-center gap-2">
              <TriangleAlert size={15} className="text-muted-foreground" /> Tracking issues
            </li>
            <li className="flex items-center gap-2">
              <Send size={15} className="text-foreground" /> Recommended actions
            </li>
          </ul>
        </div>

        {/* Illustrative Telegram-style message list — marketing content only. */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-primary/5">
          <div className="flex items-center gap-2 border-b border-border/70 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Send size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">AdMate Briefing</p>
              <p className="text-xs text-muted-foreground">Northlane · last 7 days</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {EXAMPLES.map((ex) => (
              <div key={ex.title} className={`rounded-xl border ${ex.ring} bg-background p-3`}>
                <div className="flex items-center gap-2">
                  <ex.icon size={14} className={ex.tone} />
                  <p className="text-sm font-medium text-foreground">{ex.title}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ex.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
