import Link from "next/link";

export function ReportEmptyState({ workspaceId, overview = false }: { workspaceId: string; overview?: boolean }) {
  const uploadHref = `/c/${workspaceId}/upload`;
  return (
    <>
      {overview && (
        <dl className="first-report-metrics" aria-label="Metrics are unavailable until you upload a report">
          {["Spend", "Campaigns", "Results"].map((label) => (
            <div key={label} className="card">
              <dt>{label}</dt>
              <dd>—</dd>
            </div>
          ))}
        </dl>
      )}
      <section className="empty first-report-empty" aria-label="No reports yet">
        <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V3m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <h2>No reports yet</h2>
        <p>Upload an export from Meta, TikTok, Google Ads or LinkedIn to see your own campaign data here.</p>
        <div className="first-report-actions">
          <Link className="btn primary" href={uploadHref}>Upload report</Link>
        </div>
      </section>
    </>
  );
}
