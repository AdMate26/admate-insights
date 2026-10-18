"use client";

// Public demo (AdMate integration, INTEGRATION.md): visitors who are not signed
// in see the shared sample account read-only. This flag only decides what the
// screen offers; the server refuses every change from a visitor regardless.
import { createContext, useContext, type ReactNode } from "react";

const ReadOnly = createContext(false);

export function ReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <ReadOnly.Provider value={value}>{children}</ReadOnly.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnly);
}

// Where a write control would be. Plain <a>: /login is on the website, outside
// this app's basePath.
export function SignInToChange({ what, className }: { what: string; className?: string }) {
  return (
    <a href="/login" className={className ?? "text-sm font-medium text-violet hover:underline"}>
      Sign in free to {what} →
    </a>
  );
}
