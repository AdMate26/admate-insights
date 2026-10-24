import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { LandingFooter } from "./LandingFooter";

/** Contact for privacy and terms questions (shown on /privacy and /terms). */
export const LEGAL_CONTACT_EMAIL = "privacy@admate.site";
export const LEGAL_EFFECTIVE_DATE = "October 22, 2026";

/** Plain page shell for the public legal pages (privacy policy, terms). */
export function LegalPage({
  title,
  children,
  effectiveDate = LEGAL_EFFECTIVE_DATE,
}: {
  title: string;
  children: ReactNode;
  effectiveDate?: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-5">
          <Link to="/" className="text-foreground" aria-label="AdMate home">
            Ad<strong className="font-bold">Mate</strong>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective {effectiveDate}</p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1 [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_section]:scroll-mt-6">
          {children}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

export function ContactLink() {
  return (
    <a className="text-foreground underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}
