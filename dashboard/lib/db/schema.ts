import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// People who signed in to try AdMate. Email is stored lower-cased.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// Signed-in browsers. The cookie holds a random token; only its SHA-256 is stored.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// Each person's own settings. level is the view they use (beginner | intermediate |
// advanced); no row yet means they haven't answered the welcome question.
export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One-time links for "Forgot password?". The id is the SHA-256 of the token in the
// link, so a leaked database copy can't be used to reset anyone's password.
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

// Sign-in providers linked to an account (e.g. Google), by the provider's own user id.
export const userIdentities = pgTable(
  "user_identities",
  {
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.subject] }), index("user_identities_user_idx").on(t.userId)],
);

// Explorer views a person saved (level, columns, filters, grouping, sort), so they
// follow them to every account and device.
export const savedViews = pgTable(
  "saved_views",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_views_user_idx").on(t.userId)],
);

// One workspace = one ad account (a business or brand), owned by one user.
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    // null only for accounts created before sign-in existed (old local data).
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    country: text("country"), // stored now so market benchmarks are possible later
    currency: text("currency").notNull().default("USD"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workspaces_owner_idx").on(t.ownerId)],
);

// Uploaded export files between preview and commit. Kept in the database (not on
// disk) because on Vercel the two requests can land on different servers.
export const uploads = pgTable("uploads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-objective targets and optional profit inputs (PRD F2, §7.2).
export const goals = pgTable(
  "goals",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    target: doublePrecision("target"), // target cost per result, or target ROAS for sales-by-ROAS
    marginPct: doublePrecision("margin_pct"), // sales: gross margin → break-even ROAS
    leadToCustomerPct: doublePrecision("lead_to_customer_pct"), // leads/messages: close rate
    profitPerCustomer: doublePrecision("profit_per_customer"), // leads/messages: gross profit per customer
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.objective] })],
);

export const imports = pgTable(
  "imports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    fileName: text("file_name").notNull(),
    level: text("level").notNull(),
    granularity: text("granularity").notNull(), // daily | snapshot
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    rowCount: integer("row_count").notNull(),
    currency: text("currency"),
    attribution: text("attribution"),
    status: text("status").notNull().default("active"), // active | undone | history (older TikTok syncs: kept, not undoable)
    // "performance" (campaign numbers) or a breakdown export for Audience insight (age_gender, location, …).
    kind: text("kind").notNull().default("performance"),
    diff: jsonb("diff"), // what this import replaced (newest-wins overlap handling)
    warnings: jsonb("warnings"),
    // Measure columns the export actually contained. A measure that is not listed
    // was missing from the file, which is different from a real zero.
    // null = uploaded before this was recorded (inferred from the data instead).
    columns: jsonb("columns").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("imports_ws_idx").on(t.workspaceId)],
);

// Campaigns, ad groups/ad sets and ads share one table (level + parent).
export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    level: text("level").notNull(), // campaign | ad_group | ad
    parentId: text("parent_id"),
    externalId: text("external_id"),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    objective: text("objective").notNull(),
    objectiveSource: text("objective_source").notNull(),
    // Funnel role set by the user (campaigns only). null = guessed from names.
    role: text("role"),
    status: text("status"),
    secondaryStatus: text("secondary_status"),
    budget: doublePrecision("budget"),
    firstSeen: date("first_seen", { mode: "string" }).notNull(),
    lastSeen: date("last_seen", { mode: "string" }).notNull(),
  },
  (t) => [
    index("entities_ws_idx").on(t.workspaceId, t.platform, t.level),
    index("entities_ext_idx").on(t.workspaceId, t.platform, t.level, t.externalId),
  ],
);

// Name variants the user confirmed are the same entity (fuzzy match review).
export const entityAliases = pgTable(
  "entity_aliases",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    level: text("level").notNull(),
    nameKey: text("name_key").notNull(),
    entityId: text("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.platform, t.level, t.nameKey] })],
);

// Additive measures per entity per day (daily) or per period (snapshot).
export const facts = pgTable(
  "facts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    importId: text("import_id").notNull().references(() => imports.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    campaignId: text("campaign_id").notNull(),
    adGroupId: text("ad_group_id"),
    adId: text("ad_id"),
    granularity: text("granularity").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    replacedBy: text("replaced_by"),
    spend: doublePrecision("spend").notNull().default(0),
    impressions: doublePrecision("impressions").notNull().default(0),
    reach: doublePrecision("reach").notNull().default(0),
    clicksAll: doublePrecision("clicks_all").notNull().default(0),
    linkClicks: doublePrecision("link_clicks").notNull().default(0),
    landingPageViews: doublePrecision("landing_page_views").notNull().default(0),
    engagements: doublePrecision("engagements").notNull().default(0),
    follows: doublePrecision("follows").notNull().default(0),
    videoViews: doublePrecision("video_views").notNull().default(0),
    thruplays: doublePrecision("thruplays").notNull().default(0),
    leads: doublePrecision("leads").notNull().default(0),
    messages: doublePrecision("messages").notNull().default(0),
    installs: doublePrecision("installs").notNull().default(0),
    registrations: doublePrecision("registrations").notNull().default(0),
    purchases: doublePrecision("purchases").notNull().default(0),
    conversions: doublePrecision("conversions").notNull().default(0),
    conversionValue: doublePrecision("conversion_value").notNull().default(0),
    leadFormOpens: doublePrecision("lead_form_opens").notNull().default(0),
  },
  (t) => [
    index("facts_ws_period_idx").on(t.workspaceId, t.active, t.periodStart, t.periodEnd),
    index("facts_import_idx").on(t.importId),
  ],
);

// Audience insight: spend and results split by age & gender, location, placement,
// device or hour, from breakdown exports. Kept apart from `facts` because they
// add up to the same campaign totals (storing them there would count spend twice).
export const breakdowns = pgTable(
  "breakdowns",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    importId: text("import_id").notNull().references(() => imports.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    kind: text("kind").notNull(), // age_gender | location | placement | device | hour
    segment: text("segment").notNull(), // "Women 25–34", "Phnom Penh", "Instagram Reels", …
    campaignId: text("campaign_id").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    replacedBy: text("replaced_by"),
    measures: jsonb("measures").notNull(),
  },
  (t) => [index("breakdowns_ws_kind_idx").on(t.workspaceId, t.kind, t.active, t.periodStart, t.periodEnd), index("breakdowns_import_idx").on(t.importId)],
);

// User decisions on recommendations. Recommendations themselves are recomputed
// from data; their stable key links them to the user's accept/dismiss/done.
export const recStatus = pgTable(
  "rec_status",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    status: text("status").notNull(), // accepted | snoozed | dismissed | done
    dismissReason: text("dismiss_reason"),
    title: text("title"),
    snoozeUntil: date("snooze_until", { mode: "string" }),
    doneAt: date("done_at", { mode: "string" }),
    // The entity's numbers when the finding was marked done, for the re-check.
    baseline: jsonb("baseline"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);

// Cached AI text, keyed by a hash of the facts it was written from (PRD §9.6).
export const narratives = pgTable(
  "narratives",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    surface: text("surface").notNull(),
    factsHash: text("facts_hash").notNull(),
    tone: text("tone").notNull(),
    content: jsonb("content").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("narratives_key_idx").on(t.workspaceId, t.surface, t.factsHash, t.tone)],
);

export const aiUsage = pgTable("ai_usage", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: text("workspace_id"),
  route: text("route").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  // What the answer cost at Anthropic's list prices, priced by the model that served it.
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  ok: boolean("ok").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// AdMate Assistant credits, one balance per person (lib/ai/credits.ts). Every change is
// a ledger row, so the balance is the sum and can always be explained: the beta grant,
// purchases (ref = purchase:<id>, so a purchase is credited once) and each answer's cost.
// Amounts are in hundredths of a credit.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    units: integer("units").notNull(), // + added, − used; 100 units = 1 credit
    kind: text("kind").notNull(), // grant | purchase | usage | adjust
    ref: text("ref"),
    workspaceId: text("workspace_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_ledger_user_idx").on(t.userId, t.createdAt), uniqueIndex("credit_ledger_ref_idx").on(t.userId, t.ref)],
);

// Credit pack purchases. provider "test" is the test checkout; a real provider fills
// providerRef and confirms payment the same way (completePurchase).
export const creditPurchases = pgTable("credit_purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pack: text("pack").notNull(),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  status: text("status").notNull().default("pending"), // pending | paid | canceled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

// Alerts (Advanced → Alerts): automatic alert settings per ad account, including
// which automatic checks the user switched off.
export const alertSettings = pgTable("alert_settings", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  // { on, past, target, sens: "auto" | "pct", pct, good, muted: string[] }
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The user's own KPI alerts: a metric, a limit and the campaigns it applies to.
export const alertRules = pgTable(
  "alert_rules",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(), // worse | kpi | ctr | cpm | frequency | spend | results
    op: text("op").notNull(), // by | above | below
    value: doublePrecision("value").notNull(),
    scope: text("scope").notNull(), // all | obj:<objective> | c:<campaign id>
    on: boolean("on").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alert_rules_ws_idx").on(t.workspaceId)],
);

// A campaign's own target, kept with the unit it is judged by (cost per result, ROAS or CPM).
export const campaignTargets = pgTable(
  "campaign_targets",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull(),
    mode: text("mode").notNull(), // cost | roas | cpm
    value: doublePrecision("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.campaignId] })],
);

// Where a person's alerts go on Telegram, and when. The chat is linked by a
// one-time code the person sends to the AdMate bot.
export const telegramLinks = pgTable("telegram_links", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id"),
  username: text("username"),
  linkCode: text("link_code"),
  linkCodeExpires: timestamp("link_code_expires", { withTimezone: true }),
  on: boolean("on").notNull().default(false),
  when: text("when").notNull().default("now"), // now | daily | days
  time: text("time").notNull().default("09:00"),
  days: jsonb("days").notNull().default([1, 2, 3, 4, 5]),
  tz: text("tz").notNull().default("Asia/Phnom_Penh"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Alert messages already sent, so the same message is never sent twice.
export const alertSends = pgTable(
  "alert_sends",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    digest: text("digest").notNull(), // SHA-256 of the message's alert lines
    kind: text("kind").notNull(), // now | scheduled | test
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alert_sends_user_idx").on(t.userId, t.workspaceId, t.sentAt)],
);

// AdMate integration: each signed-in person's current visit, so product
// analytics can group page views into visits and measure how long they last
// (lib/analytics-server.ts). One row per person; a new visit starts after 30
// minutes without activity.
export const userVisits = pgTable("user_visits", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  visitId: text("visit_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

// AdMate integration: TikTok for Business (MCP) connections, one per signed-in
// person (lib/tiktok/). Tokens are AES-256-GCM encrypted and bound to the
// person and purpose; nothing here is readable by the browser. Every query
// filters by user_id (lib/tiktok/store.ts). Off unless TIKTOK_CONNECT_ENABLED.
export const tiktokConnections = pgTable("tiktok_connections", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  server: text("server").notNull(), // the MCP server path the tokens are bound to
  clientId: text("client_id").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  refreshTokenEnc: text("refresh_token_enc"),
  // TikTok's authorization lasts a fixed window (30 days); refreshing does not extend it.
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  scope: text("scope").notNull(),
  status: text("status").notNull().default("active"), // active | reauth_required
  tokenVersion: integer("token_version").notNull().default(1),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
});

// One pending sign-in attempt per person: the state is stored only as a hash,
// tied to the dashboard session that started it, and used once (10 minutes).
export const tiktokOauthStates = pgTable(
  "tiktok_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull(),
    verifierEnc: text("verifier_enc").notNull(),
    server: text("server").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("tiktok_oauth_states_user_idx").on(t.userId)],
);

// A TikTok advertiser the person chose to use for one of their own ad accounts.
// Re-checked against TikTok with the person's own token before it is used.
export const tiktokAdvertiserLinks = pgTable(
  "tiktok_advertiser_links",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    advertiserId: text("advertiser_id").notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    advertiserName: text("advertiser_name"),
    currency: text("currency"),
    timezone: text("timezone"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.advertiserId] }), uniqueIndex("tiktok_advertiser_links_ws_idx").on(t.workspaceId)],
);

// Sync Now state for one linked ad account: a lock so only one sync writes into
// the account at a time (across servers), and the outcome of the last run.
// Holds no tokens and no report numbers.
export const tiktokSyncs = pgTable("tiktok_syncs", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  advertiserId: text("advertiser_id").notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  // Random per run: only the run holding the lock may write or release it.
  lockToken: text("lock_token"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  // ok | unchanged | empty | failed
  outcome: text("outcome"),
  errorCode: text("error_code"),
  rows: integer("rows"),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  importId: text("import_id"),
  // SHA-256 of the normalized rows of the last committed sync (rerun protection).
  fingerprint: text("fingerprint"),
  // What the last finished sync found (counts, dates, unavailable measures), for
  // the status poll. No report numbers, no tokens.
  summary: jsonb("summary"),
});

// Which imports came from TikTok Sync Now, for which advertiser and asked dates.
// A sync replaces earlier data narrowly (lib/data/imports.ts, syncScope), and undo
// needs to know that to hand replaced rows to the right newer import.
export const tiktokSyncImports = pgTable(
  "tiktok_sync_imports",
  {
    importId: text("import_id").primaryKey().references(() => imports.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    advertiserId: text("advertiser_id").notNull(),
    windowStart: date("window_start", { mode: "string" }).notNull(),
    windowEnd: date("window_end", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tiktok_sync_imports_ws_idx").on(t.workspaceId, t.advertiserId)],
);

// AdMate integration: the TikTok beta's per-person rate limits (lib/tiktok/beta.ts).
// One row each time someone starts a TikTok authorization or a sync: who, what
// and when, nothing from TikTok. A person's rows older than a day are pruned.
export const tiktokBetaEvents = pgTable(
  "tiktok_beta_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // connect | sync
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tiktok_beta_events_user_idx").on(t.userId, t.kind, t.createdAt)],
);
