"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx } from "./ui";

// Settings form with a sticky save bar: shows unsaved changes, saving and saved
// states, and warns before leaving with unsaved edits.
export function SettingsForm({ action, children }: { action: (formData: FormData) => Promise<void>; children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setDirty(false);
        setSaved(true);
      }}
      onInput={() => {
        setDirty(true);
        setSaved(false);
      }}
      onReset={() => setDirty(false)}
      className="space-y-6"
    >
      {children}
      <SaveBar dirty={dirty} saved={saved} />
    </form>
  );
}

function SaveBar({ dirty, saved }: { dirty: boolean; saved: boolean }) {
  const { pending } = useFormStatus();
  const state = pending ? "saving" : dirty ? "dirty" : saved ? "saved" : "idle";
  return (
    <div
      className={cx(
        "sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/5 backdrop-blur transition-colors",
        state === "dirty" || state === "saving" ? "border-violet/40 bg-bg/95" : "border-line bg-bg/90",
      )}
    >
      <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
        {state === "saving" && (
          <>
            <Spinner />
            <span className="text-muted">Saving your changes…</span>
          </>
        )}
        {state === "dirty" && (
          <>
            <span className="h-2 w-2 rounded-full bg-violet" aria-hidden />
            <span className="font-medium">You have unsaved changes</span>
          </>
        )}
        {state === "saved" && (
          <>
            <CheckIcon />
            <span className="font-medium">Saved.</span>
            <span className="hidden text-muted sm:inline">AdMate uses these from now on.</span>
          </>
        )}
        {state === "idle" && <span className="text-muted">Targets apply to every report and period.</span>}
      </p>
      <div className="flex items-center gap-2">
        {state === "dirty" && (
          <button type="reset" className={buttonClass.ghost}>
            Discard
          </button>
        )}
        <button className={buttonClass.primary + " min-w-[8.5rem]"} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-violet" aria-hidden />;
}

function CheckIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-soft text-violet" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
