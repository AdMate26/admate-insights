import { LandingHeader } from "./LandingHeader";
import { HeroSection } from "./HeroSection";
import { HowItWorks } from "./HowItWorks";
import { TelegramSection } from "./TelegramSection";
import { PricingSection } from "./PricingSection";
import { LandingFooter } from "./LandingFooter";

/** Public AdMate marketing landing page (route "/"). */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main>
        <HeroSection />
        <HowItWorks />
        <TelegramSection />
        <PricingSection />
      </main>
      <LandingFooter />
    </div>
  );
}
