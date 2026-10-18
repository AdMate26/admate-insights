"use client";

import { useTransition } from "react";
import { useReadOnly } from "@/lib/integration/read-only";
import { setCampaignRole } from "@/app/actions";
import { ROLE_LABEL, ROLES, type Role, type RoleSource } from "@/lib/analysis/roles";

// The campaign's funnel role. AdMate guesses it from the name; the user can set it.
export function RoleSelect({ workspaceId, campaignId, value, source }: { workspaceId: string; campaignId: string; value: Role; source: RoleSource }) {
  const [pending, start] = useTransition();
  const readOnly = useReadOnly(); // AdMate integration: public demo is read-only
  const user = source === "user";
  return (
    <select
      aria-label="Funnel role"
      title={user ? "Set by you. AdMate only compares campaigns with the same role." : "Guessed from the name. Change it if wrong: AdMate only compares campaigns with the same role."}
      disabled={pending || readOnly}
      value={user ? value : ""}
      onChange={(e) => start(() => setCampaignRole(workspaceId, campaignId, e.target.value === "" ? null : (e.target.value as Role)))}
      className="max-w-[160px] rounded border border-line bg-bg px-1 py-0.5 text-xs text-muted"
    >
      <option value="">{user ? "Guess from the name" : `${ROLE_LABEL[value]} (guessed)`}</option>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}
