import { startAnalytics } from "./lib/analytics";

// Product analytics (PostHog). AdMate integration: starts only after the person
// allowed analytics (components/AnalyticsConsent.tsx, shared with the website)
// and only when NEXT_PUBLIC_POSTHOG_KEY is set. See lib/analytics.ts.
startAnalytics();
