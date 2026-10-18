// Shared by proxy.ts (which must stay free of database code) and the session code.
export const SESSION_COOKIE = "admate_session";
// AdMate integration: at most 12 hours (was 30 days). After that the website
// re-checks the Supabase sign-in and re-creates the session (INTEGRATION.md).
export const SESSION_DAYS = 0.5;
