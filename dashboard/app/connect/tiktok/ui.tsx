"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { apiPath } from "@/lib/integration/paths";
import type { TikTokConnectionStatus } from "@/lib/tiktok/service";

type Advertiser = { id: string; name: string; currency: string | null; timezone: string | null; status: string | null };
type LastSync = { outcome: string | null; errorCode: string | null; finishedAt: string | null; rows: number | null; periodStart: string | null; periodEnd: string | null; running: boolean };
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
  diff: { replaced: unknown[] } | null;
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
  const replaced = r.diff?.replaced.length ? " Earlier data for the same campaigns and days was replaced and can be brought back with Undo in Reports." : "";
  const skipped = r.skipped ? ` ${r.skipped} rows were left out because a summary report you uploaded already covers those days.` : "";
  return `Imported ${r.rows - r.skipped} daily rows for ${r.campaigns} campaign${r.campaigns === 1 ? "" : "s"} (${r.period?.start} to ${r.period?.end}). Amounts are in ${r.currency}, as TikTok reports them.${replaced}${skipped}`;
}

function lastSyncText(s: LastSync | null): string {
  if (!s) return "Never synced";
  if (s.running) return "Sync running…";
  const when = s.finishedAt ? new Date(s.finishedAt).toLocaleString() : "";
  if (s.outcome === "failed") return `Last sync failed (${when})`;
  if (s.outcome === "empty") return `Last sync: TikTok had no data (${when})`;
  if (s.outcome === "unchanged") return `Last sync: already up to date (${when})`;
  if (s.outcome === "skipped") return `Last sync: already covered by an uploaded report (${when})`;
  return `Last sync: ${s.rows ?? 0} rows, ${s.periodStart} to ${s.periodEnd} (${when})`;
}

const json = { "content-type": "application/json" };

export function TikTokConnect({ status, result, accounts }: { status: TikTokConnectionStatus; result: string | null; accounts: Account[] }) {
  const [busy, setBusy] = useState(false);
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
    const body = await call("/api/tiktok/oauth/start", { method: "POST" });
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
  const link = async (advertiserId: string, workspaceId: string) => {
    if (!workspaceId) return;
    if (await call("/api/tiktok/advertisers", { method: "POST", headers: json, body: JSON.stringify({ advertiserId, workspaceId }) })) await load();
  };
  const sync = async (advertiserId: string) => {
    setSynced(null);
    setSyncing(advertiserId);
    const body = (await call("/api/tiktok/sync", { method: "POST", headers: json, body: JSON.stringify({ advertiserId }) })) as SyncResult | null;
    setSyncing(null);
    if (!body) return; // keep the error message on screen
    await load();
    setSynced({ advertiserId, result: body });
  };

  return (
    <div className="mt-6 space-y-4 text-sm">
      {result && <p className="rounded-lg border border-line px-3 py-2">{MESSAGES[result] ?? "Done."}</p>}
      {error && <p className="rounded-lg border border-bad/40 px-3 py-2 text-bad">{error}</p>}
      <p>
        Status: <b>{status.status === "active" ? "Connected" : status.status === "reauth_required" ? "Needs reconnecting" : "Not connected"}</b>
        {status.reconnectBy && status.connected ? ` · reconnect by ${new Date(status.reconnectBy).toLocaleDateString()}` : ""}
      </p>
      <div className="flex gap-2">
        {!status.connected && (
          <button className={buttonClass.primary} disabled={busy} onClick={connect}>
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
                      <button className={buttonClass.primary} disabled={busy} onClick={() => sync(a.id)}>
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
