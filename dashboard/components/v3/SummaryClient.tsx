"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { buttonClass } from "../ui";

// Centered dialog. Closing it (✕, Escape, a click outside) removes ?summary= from the URL.
export function ModalShell({ closeHref, labelledBy, children }: { closeHref: string; labelledBy: string; children: ReactNode }) {
  const router = useRouter();
  const closeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    track("summary_generated", { source: "template" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.replace(closeHref, { scroll: false });
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8 print:static print:block print:bg-transparent print:p-0" onClick={(e) => e.target === e.currentTarget && router.replace(closeHref, { scroll: false })}>
      <article role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="print-root relative flex max-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col rounded-xl border border-line bg-bg shadow-2xl print:max-h-none print:border-0 print:shadow-none">
        <Link ref={closeRef} href={closeHref} scroll={false} replace className="absolute right-4 top-4 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg print:hidden">
          Close ✕
        </Link>
        {children}
      </article>
    </div>
  );
}

export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass.ghost + " !py-1.5"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy the summary:", text);
        }
      }}
    >
      {done ? "Copied" : "Copy as text"}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className={buttonClass.ghost + " !py-1.5"} onClick={() => window.print()}>
      Print or save PDF
    </button>
  );
}
