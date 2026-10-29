# TikTok for Business connection (MCP), Phase 2

Each signed-in AdMate person can connect their own TikTok for Business account
through TikTok's hosted MCP server. AdMate can then list the advertisers they
authorized and link one to each of their own ad accounts.

**Read-only.** AdMate can call only `auth_advertiser_get` and
`advertiser_info_get`. It never creates, edits or pauses ads or changes budgets.

**Off by default.** Every route and the page answer 404 unless
`TIKTOK_CONNECT_ENABLED=true`. Only Supabase user IDs listed in
`TIKTOK_CONNECT_ALLOWED_USER_IDS` may use it; an empty list admits nobody.

## Flow

1. `POST /app/api/tiktok/oauth/start` starts a connection. It needs the same site, a
   signed-in person who is on the allowlist, and a real dashboard session.
   - It discovers the OAuth endpoints for the MCP server path. The token and
     revocation endpoints must sit under `<server>/oauth/`.
   - It creates a random state and a PKCE verifier (S256).
   - It stores only the state's SHA-256, the encrypted verifier and a hash of the
     dashboard session (10-minute expiry, one pending attempt per person).
   - It returns TikTok's consent URL, built with the exact redirect,
     `scope=mcp:tt4b` and `resource=<server>`.
2. `GET /app/api/tiktok/oauth/callback` finishes the connection.
   - It consumes the attempt atomically. This works only when the state, the
     person, the browser session and the expiry all match, and only once.
   - It exchanges the code with the verifier and stores both tokens encrypted.
   - It redirects to `/app/connect/tiktok?result=<fixed label>`, so the code and
     state are never shown again.
3. `GET /app/api/tiktok/connection` returns a safe status: no tokens, no TikTok
   identifiers. `DELETE` revokes at TikTok (best effort), then always deletes the
   person's connection, attempts and links.
4. `GET /app/api/tiktok/advertisers` lists the authorized advertisers live from
   TikTok, using that person's token, plus their links. `POST {advertiserId, workspaceId}`
   links one of them. It re-checks the advertiser against TikTok and that the ad
   account belongs to the person. `DELETE ?advertiserId=` removes a link.

## Tokens

- Encryption: AES-256-GCM, bound to the person and purpose (`tiktok:<purpose>:<userId>`),
  with the key in `TIKTOK_CONNECT_ENCRYPTION_KEY` (server-only).
- Access tokens last 24 h. They are refreshed when less than 5 minutes remain:
  - one refresh at a time per person within a server
  - the database update is conditional on `token_version`, so parallel servers
    can't overwrite newer tokens
  - rotated refresh tokens are stored
- TikTok's authorization lasts a fixed **30 days**, and refreshing never extends it
  (AdMate keeps the earlier end). After that, or when TikTok returns
  `invalid_grant`, the tokens are wiped and the status becomes `reauth_required`,
  so the person must reconnect.
- Browser responses carry fixed error codes only (`oauth_state`, `exchange`,
  `not_connected`, `reauth_required`, `provider`, `advertiser`, `workspace`). They
  never include provider text or tokens, and nothing is logged.

## Database (`drizzle/0012_tiktok_connections.sql`, new tables only)

| Table | Contents |
| --- | --- |
| `tiktok_connections` | One row per person: encrypted tokens, expiries, the server path, status, token version |
| `tiktok_oauth_states` | Pending attempts: state hash, session hash, encrypted verifier, expiry |
| `tiktok_advertiser_links` | (person, advertiser) → one of the person's ad accounts (one advertiser per account) |

Every query filters by the signed-in person's ID (`lib/tiktok/store.ts`), matching the
rest of this dashboard database (Data API off, no browser access). The migration
has **not** been applied to any shared database.

## Settings (all server-only)

| Name | Value |
| --- | --- |
| `TIKTOK_CONNECT_ENABLED` | `true` only where testing |
| `TIKTOK_CONNECT_ALLOWED_USER_IDS` | Tester Supabase user IDs, comma-separated |
| `TIKTOK_MCP_CLIENT_ID` | Public client ID from TikTok's client registration, one per environment |
| `TIKTOK_MCP_SERVER` | Optional; defaults to `.../open_mcp/tt-ads-mcp-layer` |
| `TIKTOK_CONNECT_ENCRYPTION_KEY` | `openssl rand -base64 32`; keep it, or stored connections can't be read |
| `ADMATE_PUBLIC_ORIGIN` | Existing; the callback is `<origin>/app/api/tiktok/oauth/callback` |

## Not verified yet (needs the first real-account test)

- The live inputs and outputs of `auth_advertiser_get` and `advertiser_info_get`
  through MCP. The client refuses unknown required parameters and unexpected
  formats rather than guessing.
- Whether `tt-ads-mcp-layer` allows calling these tools directly. If not, switch
  `TIKTOK_MCP_SERVER` to `tt-ads-mcp-flat`; tokens are bound to the path, so
  people reconnect after a switch.
- Whether refreshing really keeps the 30-day end and whether TikTok rotates
  refresh tokens. The code handles both cases.
- TikTok's optional email check on the consent page, and how cancellations come back.

## Before the first real connection

1. Apply `0012_tiktok_connections.sql` to an **isolated** database: the local
   embedded database first (automatic), never the live one without approval.
2. Register an MCP client once per environment (`POST <server>/oauth/register`)
   with exactly that environment's callback, e.g.
   `http://localhost:3000/app/api/tiktok/oauth/callback`, and keep its `client_id`.
3. Set the five settings above locally (`dashboard/.env.local`), with one tester
   user ID on the allowlist.
4. Run the website (3000) and dashboard (3100) locally, sign in as the tester,
   open `/app/connect/tiktok`, connect, and consent with one approved test advertiser.
5. Check:
   - the advertiser list
   - linking to the tester's own ad account
   - disconnect and reconnect
   - another signed-in person sees nothing
   - record only pass/fail and counts, never tokens or advertiser data
