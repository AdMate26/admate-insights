import posthog from "posthog-js";

// Named product events (PostHog), e.g. report_uploaded. Does nothing when
// analytics is off. Only send counts and categories — never file contents,
// account names or anything the user typed.
export function track(event: string, props?: Record<string, string | number | boolean | null>) {
  if (posthog.__loaded) posthog.capture(event, props);
}
