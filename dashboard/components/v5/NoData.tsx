"use client";

import Link from "next/link";
import { useV5 } from "./ctx";

// An account with no uploaded report yet: say what AdMate needs, and where to add it.
export function NoData({ title = "No data yet" }: { title?: string }) {
  const { ws, name } = useV5();
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
