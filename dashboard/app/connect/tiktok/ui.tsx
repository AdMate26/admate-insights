"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { apiPath } from "@/lib/integration/paths";
import type { TikTokConnectionStatus } from "@/lib/tiktok/service";

type Advertiser = { id: string; name: string; currency: string | null; timezone: string | null; status: string | null };
type LastSync = { outcome: string | null; errorCode: string | null; finishedAt: string | null; rows: number | null; periodStart: string | null; periodEnd: string | null; running: boolean; interrupted: boolean };
type AdvertiserLink = { advertiserId: string; workspaceId: string; lastSync: LastSync | null };
type Account = { id: string; name: string; currency: string; isSample: boolean };
type SyncResult = {
  outcome: "ok" | "unchanged" | "empty" | "skipped";
  window: { start: string; end: string };
  period: { start: string; end: string } | null;
  rows: number;
  campaigns: number;
  currency: string;
  timezone: string;
  replaced: number; // earlier reports whose overlapping days were replaced
  skipped: number;
  unavailable: { measure: string; label: string; reason: string }[];
};

const MESSAGES: Record<string, string> = {
  connected: "TikTok is connected.",
  cancelled: "The TikTok sign-in was cancelled.",
  oauth_state: "That sign-in attempt expired or belonged to another session. Please start again.",
  exchange: "TikTok did not accept the sign-in. Please start again.",
  reauth_required: "TikTok's authorization ended. Please connect again.",
  provider: "TikTok could not be reached. Please try again.",
  not_connected: "TikTok isn't connected.",
  advertiser: "That advertiser isn't authorized for your TikTok connection any more.",
  workspace: "Choose one of your own ad accounts.",
  sample: "The sample account can't take real TikTok data. Choose one of your own ad accounts.",
  currency: "The advertiser and the ad account use different currencies. AdMate never converts money: use an ad account with the advertiser's currency.",
  busy: "A sync is running or has just finished for this ad account. Please wait a minute and try again.",
  import_limit: "This ad account already holds the maximum number of reports. Undo an old one in Reports first.",
  report: "TikTok's report couldn't be used, so nothing was imported. Please try again later.",
  timeout: "TikTok took too long to answer, so nothing was imported. Please try again later.",
  storage: "AdMate couldn't save the data, so nothing was changed. Please try again later.",
  consent: "Please read the beta notice and tick the box to continue.",
  connect_closed: "New TikTok connections are paused for the beta right now. Please try again later.",
  connect_limit: "Too many connection attempts in the last hour. Please wait and try again.",
  beta_full: "The TikTok beta is full right now. Please try again later.",
  sync_limit: "You've reached the beta's sync limit (6 an hour, 24 a day). Please try again later.",
  account_limit: "You already have the maximum number of ad accounts. Delete one in Targets & settings to add another.",
  interrupted: "The last sync was interrupted before it finished (for example a server restart). It's safe to press Sync now again: AdMate never counts the same day twice.",
};

function syncSummary(r: SyncResult): string {
  if (r.outcome === "empty") {
    return `TikTok has no campaign data for ${r.window.start} to ${r.window.end}. Nothing was imported, and the data already in this ad account was left exactly as it was.`;
  }
  if (r.outcome === "unchanged") {
    return `Already up to date: TikTok's numbers for ${r.period?.start} to ${r.period?.end} match the last sync, so nothing was written.`;
  }
  if (r.outcome === "skipped") {
    return `Every day TikTok returned is already covered by a summary report you uploaded, so nothing was written. Undo that report in Reports if you want TikTok's daily numbers instead.`;
  }
  const replaced = r.replaced ? " Earlier data for the same campaigns and days was replaced and can be brought back with Undo in Reports." : "";
  const skipped = r.skipped ? ` ${r.skipped} rows were left out because a summary report you uploaded already covers those days.` : "";
  return `Imported ${r.rows - r.skipped} daily rows for ${r.campaigns} campaign${r.campaigns === 1 ? "" : "s"} (${r.period?.start} to ${r.period?.end}). Amounts are in ${r.currency}, as TikTok reports them.${replaced}${skipped}`;
}

function lastSyncText(s: LastSync | null): string {
  if (!s) return "Never synced";
  if (s.running) return "Sync running…";
  if (s.interrupted) return "Last sync was interrupted. Press Sync now to try again.";
  const when = s.finishedAt ? new Date(s.finishedAt).toLocaleString() : "";
  if (s.outcome === "failed") return `Last sync failed (${when})`;
  if (s.outcome === "empty") return `Last sync: TikTok had no data (${when})`;
  if (s.outcome === "unchanged") return `Last sync: already up to date (${when})`;
  if (s.outcome === "skipped") return `Last sync: already covered by an uploaded report (${when})`;
  return `Last sync: ${s.rows ?? 0} rows, ${s.periodStart} to ${s.periodEnd} (${when})`;
}

const json = { "content-type": "application/json" };

export function TikTokConnect({ status, result, accounts, beta }: { status: TikTokConnectionStatus; result: string | null; accounts: Account[]; beta: boolean }) {
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertisers, setAdvertisers] = useState<Advertiser[] | null>(null);
  const [links, setLinks] = useState<AdvertiserLink[]>([]);
  const [synced, setSynced] = useState<{ advertiserId: string; result: SyncResult } | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const ownAccounts = accounts.filter((a) => !a.isSample);

  async function call(path: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath(path), { ...init, credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(MESSAGES[body.error] ?? "Something went wrong.");
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const connect = async () => {
    if (beta && !consent) {
      setError(MESSAGES.consent);
      return;
    }
    const body = await call("/api/tiktok/oauth/start", { method: "POST", headers: json, body: JSON.stringify({ consent: beta ? consent : undefined }) });
    if (body?.url) window.location.assign(body.url);
  };
  const disconnect = async () => {
    if (await call("/api/tiktok/connection", { method: "DELETE" })) window.location.reload();
  };
  const load = async () => {
    const body = await call("/api/tiktok/advertisers");
    if (body) {
      setAdvertisers(body.advertisers);
      setLinks(body.links);
    }
  };
  // A new account of the person's own, in the advertiser's currency, linked straight away.
  const createAccount = async (advertiserId: string) => {
    const body = await call("/api/tiktok/advertisers", { method: "POST", headers: json, body: JSON.stringify({ advertiserId, createAccount: true }) });
    if (body?.workspaceId) window.location.reload();
  };
  const link = async (advertiserId: string, workspaceId: string) => {
    if (!workspaceId) return;
    if (await call("/api/tiktok/advertisers", { method: "POST", headers: json, body: JSON.stringify({ advertiserId, workspaceId }) })) await load();
  };
  // Sync Now answers straight away and continues in the background; the page
  // asks for the outcome every 2 seconds, for up to 7 minutes: past the 6-minute
  // lock, so a run the platform cut off shows as interrupted.
  const sync = async (advertiserId: string) => {
    setSynced(null);
    const startedAt = Date.now();
    const started = await call("/api/tiktok/sync", { method: "POST", headers: json, body: JSON.stringify({ advertiserId }) });
    if (!started) return; // keep the error message on screen
    setSyncing(advertiserId);
    let status: (LastSync & { summary: SyncResult | null }) | null = null;
    for (let i = 0; i < 210; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(apiPath(`/api/tiktok/sync?advertiserId=${advertiserId}`), { credentials: "same-origin" }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) : null;
      const s = body?.status ?? null;
      if (s && !s.running && (s.interrupted || (s.finishedAt && Date.parse(s.finishedAt) >= startedAt - 60_000))) {
        status = s;
        break;
      }
    }
    setSyncing(null);
    await load();
    if (!status) setError("The sync is taking longer than expected. Check again in a few minutes.");
    else if (status.interrupted) setError(MESSAGES.interrupted);
    else if (status.outcome === "failed" || !status.summary) setError(MESSAGES[status.errorCode ?? ""] ?? "Something went wrong.");
    else setSynced({ advertiserId, result: status.summary });
  };

  return (
    <div className="mt-6 space-y-4 text-sm">
      {result && <p className="rounded-lg border border-line px-3 py-2">{MESSAGES[result] ?? "Done."}</p>}
      {error && <p className="rounded-lg border border-bad/40 px-3 py-2 text-bad">{error}</p>}
      <p>
        Status: <b>{status.status === "active" ? "Connected" : status.status === "reauth_required" ? "Needs reconnecting" : "Not connected"}</b>
        {status.reconnectBy && status.connected ? ` · reconnect by ${new Date(status.reconnectBy).toLocaleDateString()}` : ""}
      </p>
      {beta && !status.connected && (
        <div className="space-y-2 rounded-lg border border-line px-3 py-2">
          <p className="font-medium">AdMate TikTok beta (test version)</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>AdMate gets read-only access to the TikTok advertisers you choose on TikTok&apos;s next screen: their names, currency and campaign reports. It never creates, edits or pauses ads and never changes budgets.</li>
            <li>Your TikTok authorization is stored encrypted and used only for your own AdMate accounts. Nobody else can see your data.</li>
            <li>Imported report data is kept in AdMate&apos;s test database in Singapore while the beta runs, and deleted when the beta ends.</li>
            <li>This is a test version: features can change, and the beta can be paused at any time.</li>
            <li>You can disconnect at any time. That revokes AdMate&apos;s access at TikTok and deletes the stored authorization; imported accounts can be deleted in Targets &amp; settings.</li>
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree to connect my TikTok Ads data to this AdMate beta as described above, and to the{" "}
              <a className="underline" href="/terms" target="_blank" rel="noreferrer">
                Terms
              </a>{" "}
              and{" "}
              <a className="underline" href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              .
            </span>
          </label>
        </div>
      )}
      <div className="flex gap-2">
        {!status.connected && (
          <button className={buttonClass.primary} disabled={busy || (beta && !consent)} onClick={connect}>
            {status.status === "reauth_required" ? "Reconnect TikTok" : "Connect TikTok Ads"}
          </button>
        )}
        {status.status !== "not_connected" && (
          <button className={buttonClass.ghost} disabled={busy} onClick={disconnect}>
            Disconnect
          </button>
        )}
        {status.connected && (
          <button className={buttonClass.ghost} disabled={busy} onClick={load}>
            Show my advertisers
          </button>
        )}
      </div>
      {advertisers && (
        <ul className="space-y-2">
          {advertisers.length === 0 && <li>No advertisers were authorized.</li>}
          {advertisers.map((a) => {
            const linked = links.find((l) => l.advertiserId === a.id);
            const account = accounts.find((w) => w.id === linked?.workspaceId);
            const result = synced?.advertiserId === a.id ? synced.result : null;
            return (
              <li key={a.id} className="space-y-2 rounded-lg border border-line px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{a.name}</b> {[a.currency, a.timezone].filter(Boolean).join(" · ")}
                  </span>
                  {!linked && a.currency && !ownAccounts.some((w) => w.currency.toUpperCase() === a.currency!.toUpperCase()) && (
                    <button className={buttonClass.primary} disabled={busy} onClick={() => createAccount(a.id)}>
                      Create a {a.currency} account for this advertiser
                    </button>
                  )}
                  <select className="rounded border border-line bg-bg px-2 py-1" disabled={busy} value={linked?.workspaceId ?? ""} onChange={(e) => link(a.id, e.target.value)}>
                    <option value="">Use for ad account…</option>
                    {ownAccounts.map((w) => (
                      <option key={w.id} value={w.id} disabled={!!a.currency && w.currency.toUpperCase() !== a.currency.toUpperCase()}>
                        {w.name} ({w.currency})
                      </option>
                    ))}
                  </select>
                </div>
                {linked && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
                    <span>{lastSyncText(linked.lastSync)}</span>
                    <span className="flex items-center gap-2">
                      {account && (
                        <Link className="underline" href={`/c/${account.id}`}>
                          Open {account.name}
                        </Link>
                      )}
                      <button className={buttonClass.primary} disabled={busy || !!syncing} onClick={() => sync(a.id)}>
                        {syncing === a.id ? "Syncing…" : "Sync now"}
                      </button>
                    </span>
                  </div>
                )}
                {result && (
                  <div className="rounded-lg border border-line px-3 py-2">
                    <p>{syncSummary(result)}</p>
                    {result.unavailable.length > 0 && (
                      <details className="mt-1 text-muted">
                        <summary>Not available from TikTok ({result.unavailable.length})</summary>
                        <ul className="mt-1 list-disc pl-5">
                          {result.unavailable.map((u) => (
                            <li key={u.measure}>
                              {u.label}: {u.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
