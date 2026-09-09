export function ReportsView() {
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

      <div className="panel">
        <div className="empty">
          <strong>Report templates are coming soon</strong>
          There isn&rsquo;t an official client-report template yet. The analysis that will drive it
          already powers Overview, Alerts and Briefings — polished, exportable reports arrive in the
          next phase.
        </div>
      </div>
    </section>
  );
}
