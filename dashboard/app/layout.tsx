import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "./v5.css";
import "./v5-extra.css";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { PageTracker } from "@/components/PageTracker";
import { getCurrentUser } from "@/lib/auth/session";

// Brand typography: Space Grotesk for interface and advice, IBM Plex Mono for metrics.
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["400", "500", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "AdMate", template: "%s · AdMate" },
  description: "AdMate is an AI marketing analyst: it watches advertising performance and tells the marketer what deserves attention.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // AdMate integration: signed-in page views are recorded by the server (PageTracker).
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <AnalyticsConsent />
        <PageTracker signedIn={!!user && !user.readOnly} />
      </body>
    </html>
  );
}
