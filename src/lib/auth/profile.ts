import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * The slice of the hosted `profiles` row the app needs for routing.
 *
 * The row is created by the database's auth.users → profiles trigger; the
 * frontend never inserts or updates it. The generated Supabase types predate
 * the hosted AdMate schema (they have no `onboarding_status`), so the query
 * below declares this shape explicitly instead of editing generator-owned
 * files.
 */
export type OwnProfile = {
  id: string;
  onboarding_status: string | null;
};

/**
 * `onboarding_status` is used ONLY to decide where to send a user after login.
 * It is not a payment or entitlement signal (subscriptions own that).
 */
const ONBOARDING_COMPLETE_VALUES = new Set(["completed", "complete"]);

export function isOnboardingComplete(status: string | null | undefined): boolean {
  return typeof status === "string" && ONBOARDING_COMPLETE_VALUES.has(status.toLowerCase());
}

/** The profile row the trigger should have created is missing. */
export class ProfileMissingError extends Error {
  constructor() {
    super("Profile row not found for the signed-in user");
    this.name = "ProfileMissingError";
  }
}

/** Reading the user's own profile failed (network, RLS, or configuration). */
export class ProfileLoadError extends Error {
  constructor(cause?: unknown) {
    super("Could not load the signed-in user's profile");
    this.name = "ProfileLoadError";
    this.cause = cause;
  }
}

export const PROFILE_QUERY_KEY = ["own-profile"] as const;

/**
 * Reads the signed-in user's own profile. RLS restricts `profiles` to the
 * caller's row; the explicit `id` filter keeps the query unambiguous.
 */
export async function fetchOwnProfile(userId: string): Promise<OwnProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, onboarding_status")
    .eq("id", userId)
    .maybeSingle()
    .overrideTypes<OwnProfile, { merge: false }>();

  if (error) {
    if (import.meta.env.DEV) console.warn("[auth] profile query failed", error);
    throw new ProfileLoadError(error);
  }
  if (!data) throw new ProfileMissingError();
  return data;
}

export function profileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...PROFILE_QUERY_KEY, userId],
    queryFn: () => fetchOwnProfile(userId),
    staleTime: 60_000,
    retry: false,
  });
}
