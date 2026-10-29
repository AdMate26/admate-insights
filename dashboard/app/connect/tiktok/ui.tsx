"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { apiPath } from "@/lib/integration/paths";
import type { TikTokConnectionStatus } from "@/lib/tiktok/service";

type Advertiser = { id: string; name: string; currency: string | null; timezone: string | null; status: string | null };
type Link = { advertiserId: string; workspaceId: string };

const MESSAGES: Record<string, string> = {
  connected: "TikTok is connected.",
  cancelled: "The TikTok sign-in was cancelled.",
  oauth_state: "That sign-in attempt expired or belonged to another session. Please start again.",
  exchange: "TikTok did not accept the sign-in. Please start again.",
  reauth_required: "TikTok's authorization ended. Please connect again.",
  provider: "TikTok could not be reached. Please try again.",
};

const json = { "content-type": "application/json" };

export function TikTokConnect({ status, result, accounts }: { status: TikTokConnectionStatus; result: string | null; accounts: { id: string; name: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertisers, setAdvertisers] = useState<Advertiser[] | null>(null);
  const [links, setLinks] = useState<Link[]>([]);

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
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <span>
                  <b>{a.name}</b> {[a.currency, a.timezone].filter(Boolean).join(" · ")}
                </span>
                <select className="rounded border border-line bg-bg px-2 py-1" disabled={busy} value={linked?.workspaceId ?? ""} onChange={(e) => link(a.id, e.target.value)}>
                  <option value="">Use for ad account…</option>
                  {accounts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
