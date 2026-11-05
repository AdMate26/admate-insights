"use client";

import Link from "next/link";
import { useV5 } from "./ctx";

// An account with no uploaded report yet: say what AdMate needs, and where to add it.
export function NoData({ title = "No data yet" }: { title?: string }) {
  const { ws, name, tiktok } = useV5();
  // AdMate integration: an account linked to a TikTok advertiser gets its data from Sync Now.
  if (tiktok) {
    const last = tiktok.lastSync;
    return (
      <>
        <div className="head">
          <div>
            <span className="eyebrow">{name}</span>
            <h1>{title}</h1>
          </div>
        </div>
        <div className="empty" style={{ padding: "40px 22px" }}>
          <b>Connected to TikTok: {tiktok.advertiserName}</b>
          {!last
            ? "Not synced yet. Press Sync now on the TikTok page and AdMate imports this advertiser’s campaign reports."
            : last.outcome === "empty"
              ? `No TikTok campaigns${last.from && last.to ? ` from ${last.from} to ${last.to}` : " yet"}. Run a campaign on TikTok, then press Sync now to import its results.`
              : last.outcome === "failed"
                ? "The last sync didn’t finish. Press Sync now on the TikTok page to try again."
                : "Press Sync now on the TikTok page to import the latest campaign reports."}
          {last && <span style={{ display: "block", marginTop: 6, color: "var(--muted)" }}>Last sync {new Date(last.at).toLocaleString()}</span>}
          <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn primary" href="/connect/tiktok">
              Open TikTok sync
            </Link>
            <Link className="btn" href={`/c/${ws}/upload`}>
              Upload an export instead
            </Link>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="head">
        <div>
          <span className="eyebrow">{name}</span>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="empty" style={{ padding: "40px 22px" }}>
        <b>Upload your first report</b>
        Upload an export from Meta Ads Manager, Google Ads, TikTok Ads or LinkedIn Campaign Manager. AdMate reads it, judges each campaign by its goal and tells you what to do next.
        <div style={{ marginTop: 14 }}>
          <Link className="btn primary" href={`/c/${ws}/upload`}>
            Upload an export
          </Link>
        </div>
      </div>
    </>
  );
}
