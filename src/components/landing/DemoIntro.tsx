import { ArrowRight, CircleAlert, CircleCheck, FlaskConical, TriangleAlert } from "lucide-react";

import "./demo-intro.css";

// Display snapshot of Northlane's existing Meta synthetic fixture. Counts are
// the unchanged analyzer's Low (3), High (1), and Error (1) findings.
const signals = [
  { count: 3, label: "Campaigns need attention", icon: CircleAlert, tone: "attention" },
  { count: 1, label: "Campaign performing strongly", icon: CircleCheck, tone: "strong" },
  { count: 1, label: "Data issue", icon: TriangleAlert, tone: "issue" },
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
            See how AdMate reviews ads across TikTok, Meta, Google Search and LinkedIn — then
            highlights what needs attention, what is performing strongly, and what to do next.
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
              <h3>Northlane · Meta</h3>
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
            <p>ABO | Prospecting | UGC hooks</p>
            <h4>Creative fatigue</h4>
            <p>
              <strong>Next step:</strong> Test three fresh creative variants before changing budget.
            </p>
          </article>
          <article className="cl-demo-finding">
            <p>Advantage+ Shopping</p>
            <h4>Healthy scaling</h4>
            <p>
              <strong>Next step:</strong> Scale in steps of 20% or less and watch frequency and
              conversion rate.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
