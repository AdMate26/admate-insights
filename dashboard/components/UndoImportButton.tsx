"use client";

import { useTransition } from "react";
import { undoImportAction } from "@/app/actions";
import { track } from "@/lib/analytics";
import { buttonClass } from "./ui";

export function UndoImportButton({ workspaceId, importId }: { workspaceId: string; importId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className={buttonClass.quiet}
      disabled={pending}
      onClick={() => {
        if (!confirm("Undo this upload? Its data is removed and anything it replaced comes back.")) return;
        track("report_undone");
        start(() => undoImportAction(workspaceId, importId));
      }}
    >
      {pending ? "Undoing…" : "Undo"}
    </button>
  );
}
