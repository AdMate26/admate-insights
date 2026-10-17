/**
 * Client-safe description of a live data connection's state. Produced on the
 * server by the Meta provider and rendered by the workspace UI. It carries
 * account metadata and a human-readable error only — never tokens, raw API
 * responses or internal error text.
 */

export type MetaErrorKind =
  | "not_configured"
  | "token_invalid"
  | "permission"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "unknown";

export type LiveAccount = {
  id: string;
  name: string;
  /** Human-readable account status, e.g. "Active", "Disabled". */
  status: string;
  currency: string | null;
  timezone: string | null;
};

export type LiveConnection =
  | {
      provider: "meta";
      status: "connected";
      account: LiveAccount;
      /** Campaigns the token can read in the account. */
      totalCampaigns: number;
      /** Campaigns with delivery inside the analysis window. */
      deliveringCampaigns: number;
      /** Account-local dates of the analysis window (inclusive). */
      window: { since: string; until: string };
      checkedAt: string;
    }
  | {
      provider: "meta";
      status: "error";
      error: { kind: MetaErrorKind; message: string };
      checkedAt: string;
    };
