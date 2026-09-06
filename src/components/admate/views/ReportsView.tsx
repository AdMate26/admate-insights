import type { AdMateAnalysis } from "@/lib/admate.functions";
import { PERFORMANCE_ORDER } from "@/lib/analysis/engine";
import { platformMeta } from "@/lib/platforms";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ReportsView({ analyses }: { analyses: AdMateAnalysis[] }) {
  return (
    <section aria-labelledby="rp-title">
      <div className="view-head">
        <h1 className="view-title" id="rp-title">
          Client-ready reports in one click
        </h1>
        <p className="view-sub">
          A plain-language snapshot per platform, written from the same analysis used for alerts and
          briefings. Client-specific targets, margin and AOV arrive in the next phase.
        </p>
      </div>

      <div className="report-grid">
        {analyses.map((a) => {
          const counts = PERFORMANCE_ORDER.map((p) => ({
            p,
            n: a.findings.filter((f) => f.performance === p).length,
          }));
          const low = a.findings.filter((f) => f.performance === "Low");
          return (
            <div className="panel" key={a.platform}>
              <div className="panel-head">
                <h2 className="panel-title">{platformMeta(a.platform).label}</h2>
                <span className="panel-note">{money(a.totalSpend)} · 7 days</span>
              </div>
              <div className="report-tally">
                {counts.map((c) => (
                  <span key={c.p}>
                    <b>{c.n}</b> {c.p}
                  </span>
                ))}
              </div>
              <p className="fam-blurb">
                {low.length === 0
                  ? "No campaign is materially underperforming this week."
                  : `${low.length} campaign${low.length === 1 ? "" : "s"} need attention: ${low
                      .map((f) => `${f.campaignName} (${f.signal})`)
                      .join("; ")}.`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
