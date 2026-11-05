import { ArrowRight, CircleAlert, CircleCheck, FlaskConical, TriangleAlert } from "lucide-react";

import "./demo-intro.css";

// Snapshot of the current Lotus sample's default seven-day Actions view.
// These findings come from the existing Project B sample and analysis.
const signals = [
  { count: 5, label: "Performance problems", icon: CircleAlert, tone: "attention" },
  { count: 3, label: "Opportunities to explore", icon: CircleCheck, tone: "strong" },
  { count: 1, label: "Tracking issue", icon: TriangleAlert, tone: "issue" },
] as const;

export function DemoIntro() {
  return (
    <section className="cl-demo" id="demo" aria-labelledby="cl-demo-title">
      <div className="cl-wrap cl-demo-layout">
        <div className="cl-demo-copy">
          <p className="cl-kicker">
            <FlaskConical size={16} aria-hidden="true" /> DEMO MODE · SYNTHETIC DATA
          </p>
          <h2 id="cl-demo-title">Explore AdMate with Sample Campaign Data</h2>
          <p>
            See how AdMate reviews sample Meta and TikTok campaigns — then highlights what needs
            attention, what is performing strongly, and what to do next.
          </p>
          <div className="cl-demo-actions">
            <a
              href="/demo"
              className="cl-button cl-primary"
              aria-describedby="cl-demo-availability"
            >
              View Full Demo <ArrowRight size={16} aria-hidden="true" />
            </a>
            <p id="cl-demo-availability">No login or ad account required.</p>
          </div>
        </div>
        <div className="cl-demo-preview">
          <header className="cl-demo-preview-header">
            <div>
              <p className="cl-kicker">SAMPLE ACCOUNT</p>
              <h3>Lotus Skincare</h3>
            </div>
            <span>Synthetic data</span>
          </header>
          <ul className="cl-demo-stats" aria-label="Sample campaign findings">
            {signals.map(({ count, label, icon: Icon, tone }) => (
              <li key={tone} data-tone={tone}>
                <div>
                  <Icon size={18} aria-hidden="true" />
                  <strong>{count}</strong>
                </div>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <article className="cl-demo-finding">
            <p>Messages | Broad | Promo video</p>
            <h4>Creative fatigue</h4>
            <p>
              <strong>Next step:</strong> Refresh the campaign’s creatives.
            </p>
          </article>
          <article className="cl-demo-finding">
            <p>Sales | Website | Catalog</p>
            <h4>Landing page / checkout drop</h4>
            <p>
              <strong>Next step:</strong> Check the landing page or form behind the campaign.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
