"use client";

import { useTransition } from "react";
import { useReadOnly } from "@/lib/integration/read-only";
import { setCampaignObjective } from "@/app/actions";
import { OBJECTIVE_DEFS, OBJECTIVES, type Objective } from "@/lib/metrics/objectives";

export function ObjectiveSelect({ workspaceId, campaignId, value, source }: { workspaceId: string; campaignId: string; value: Objective; source: string }) {
  const [pending, start] = useTransition();
  const readOnly = useReadOnly(); // AdMate integration: public demo is read-only
  return (
    <select
      aria-label="Campaign objective"
      title={source === "user" ? "Set by you" : `Detected from ${source.replace("_", " ")} — change it if wrong`}
      disabled={pending || readOnly}
      value={value}
      onChange={(e) => start(() => setCampaignObjective(workspaceId, campaignId, e.target.value as Objective))}
      className="max-w-[140px] rounded border border-line bg-bg px-1 py-0.5 text-xs text-muted"
    >
      {OBJECTIVES.map((o) => (
        <option key={o} value={o}>
          {OBJECTIVE_DEFS[o].label}
        </option>
      ))}
    </select>
  );
}
