import type { ReactNode } from "react";
import { AppIcon } from "@/components/Logo";

// Centered card shared by the sign-in and sign-up pages.
export function AuthFrame({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-line bg-bg p-6 shadow-sm sm:p-8">
        <AppIcon size={40} />
        <p className="label mt-5">AdMate · AI marketing analyst</p>
        <h1 className="mt-1 text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">{intro}</p>
        {children}
      </div>
    </main>
  );
}
