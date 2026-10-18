import posthog from "posthog-js";

// Product analytics (PostHog): page views, clicks, session length and session
// replays, per signed-in user (see components/UserMenu.tsx). Off unless
// NEXT_PUBLIC_POSTHOG_KEY is set. Events go through /ingest on AdMate's own
// domain (next.config.ts) so ad blockers — common among marketers — don't drop them.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  try {
    posthog.init(key, {
      api_host: "/ingest",
      ui_host: host.replace(".i.posthog.com", ".posthog.com"),
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      // Replays never show what people type (emails, passwords, targets).
      session_recording: { maskAllInputs: true },
    });
  } catch (err) {
    console.warn("[admate] analytics failed to start:", err);
  }
}
