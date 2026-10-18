"use client";

import { useTransition } from "react";
import { useReadOnly } from "@/lib/integration/read-only";
import { deleteWorkspace } from "@/app/actions";
import { buttonClass } from "./ui";

export function DeleteClientButton({ workspaceId }: { workspaceId: string }) {
  const [pending, start] = useTransition();
  if (useReadOnly()) return null; // AdMate integration: public demo is read-only
  return (
    <button
      type="button"
      className={buttonClass.ghost + " border-bad/40 !text-bad hover:!bg-bad-soft"}
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this ad account and all its uploaded reports? This can't be undone.")) start(() => deleteWorkspace(workspaceId));
      }}
    >
      {pending ? "Deleting…" : "Delete account"}
    </button>
  );
}
