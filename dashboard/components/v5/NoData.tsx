"use client";

import { useV5 } from "./ctx";
import { ReportEmptyState } from "./ReportEmptyState";

export function NoData({ title = "No data yet", overview = false }: { title?: string; overview?: boolean }) {
  const { ws, name } = useV5();
  return (
    <>
      <div className="head">
        <div>
          <span className="eyebrow">{name}</span>
          <h1>{title}</h1>
        </div>
      </div>
      <ReportEmptyState workspaceId={ws} overview={overview} />
    </>
  );
}
