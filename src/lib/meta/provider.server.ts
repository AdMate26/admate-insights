/**
 * Read-only Meta Marketing API provider — server-only.
 *
 * Verifies the configured ad account, lists its campaigns, and (only when there
 * are campaigns) reads ad sets plus daily campaign insights for the analysis
 * window, then maps everything to `CampaignInput[]`.
 *
 * Never throws: every failure becomes a `status: "error"` connection carrying a
 * fixed, human-readable message. An account with zero campaigns or no delivery
 * is a successful connection with an empty campaign list — no data is invented.
 */

import type { CampaignInput } from "../analysis/engine";
import type { LiveConnection } from "../live-connection";
import { readMetaConfig } from "./config.server";
import { createGraphClient, MetaApiError, type FetchLike } from "./graph.server";
import {
  accountStatusLabel,
  analysisWindow,
  localToday,
  mapMetaCampaigns,
  type MetaAccount,
  type MetaAdSet,
  type MetaCampaign,
  type MetaInsightRow,
} from "./mapping";

/** Days of history read for the engine's two 7-day comparison windows. */
export const META_HISTORY_DAYS = 14;

export type MetaLiveResult = {
  campaigns: CampaignInput[];
  /** Account-local "today" — the engine excludes it from the windows. */
  todayIso: string;
  connection: LiveConnection;
};

const ACCOUNT_FIELDS = "account_id,name,account_status,currency,timezone_name";
const CAMPAIGN_FIELDS =
  "id,name,objective,status,effective_status,start_time,stop_time,bid_strategy";
const ADSET_FIELDS =
  "id,campaign_id,effective_status,optimization_goal,bid_strategy,bid_constraints,promoted_object,learning_stage_info";
const INSIGHT_FIELDS = [
  "campaign_id",
  "date_start",
  "spend",
  "impressions",
  "reach",
  "inline_link_clicks",
  "actions",
  "action_values",
  "video_thruplay_watched_actions",
  "video_continuous_2_sec_watched_actions",
  "video_p100_watched_actions",
].join(",");

export async function loadMetaLiveData(options: {
  idPrefix: string;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<MetaLiveResult> {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const fallbackToday = localToday(null, now);

  const config = readMetaConfig();
  if (!config) {
    const err = new MetaApiError("not_configured");
    return {
      campaigns: [],
      todayIso: fallbackToday,
      connection: {
        provider: "meta",
        status: "error",
        error: { kind: err.kind, message: err.publicMessage },
        checkedAt,
      },
    };
  }

  const graph = createGraphClient(config, options.fetchImpl);
  const accountPath = `act_${config.adAccountId}`;

  try {
    // 1. Prove the token can read this exact account.
    const account = await graph.get<MetaAccount>(accountPath, { fields: ACCOUNT_FIELDS });
    const timezone = account.timezone_name ?? null;
    const todayIso = localToday(timezone, now);
    const window = analysisWindow(todayIso, META_HISTORY_DAYS);

    // 2. Campaigns the token can read.
    const campaigns = await graph.getAll<MetaCampaign>(`${accountPath}/campaigns`, {
      fields: CAMPAIGN_FIELDS,
      limit: "200",
    });

    // 3. Ad sets + daily insights — only worth fetching when campaigns exist.
    let adsets: MetaAdSet[] = [];
    let insights: MetaInsightRow[] = [];
    if (campaigns.length > 0) {
      [adsets, insights] = await Promise.all([
        graph.getAll<MetaAdSet>(`${accountPath}/adsets`, { fields: ADSET_FIELDS, limit: "200" }),
        graph.getAll<MetaInsightRow>(`${accountPath}/insights`, {
          level: "campaign",
          time_increment: "1",
          time_range: JSON.stringify(window),
          fields: INSIGHT_FIELDS,
          use_unified_attribution_setting: "true",
          limit: "500",
        }),
      ]);
    }

    const mapped = mapMetaCampaigns({
      campaigns,
      adsets,
      insights,
      window,
      idPrefix: options.idPrefix,
    });

    return {
      campaigns: mapped,
      todayIso,
      connection: {
        provider: "meta",
        status: "connected",
        account: {
          id: account.account_id ?? config.adAccountId,
          name: account.name?.trim() || `Ad account ${config.adAccountId}`,
          status: accountStatusLabel(account.account_status),
          currency: account.currency ?? null,
          timezone,
        },
        totalCampaigns: campaigns.length,
        deliveringCampaigns: mapped.length,
        window,
        checkedAt,
      },
    };
  } catch (error) {
    const err = error instanceof MetaApiError ? error : new MetaApiError("unknown");
    if (!(error instanceof MetaApiError)) {
      // A code bug (e.g. an unexpected response shape). The token is only ever
      // sent in a request header, so it cannot appear in this message.
      console.error(
        "[meta] unexpected provider failure",
        error instanceof Error ? `${error.name}: ${error.message}` : typeof error,
      );
    }
    return {
      campaigns: [],
      todayIso: fallbackToday,
      connection: {
        provider: "meta",
        status: "error",
        error: { kind: err.kind, message: err.publicMessage },
        checkedAt,
      },
    };
  }
}
