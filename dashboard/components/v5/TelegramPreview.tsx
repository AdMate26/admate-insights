"use client";

import { useEffect, useState } from "react";
import { digestIcon, type Digest } from "@/lib/analysis/alerts";
import { apiPath } from "@/lib/integration/paths";

// How the alert looks on a phone: the lock-screen notification, then the one message
// in the chat: a picture (drawn by the server, exactly what lib/telegram.ts sends), a
// short caption and the buttons that open AdMate for the details.
export function TelegramPreview({ d, when }: { d: Digest; when: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(d);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    fetch(apiPath("/api/telegram/card"), { method: "POST", headers: { "content-type": "application/json" }, body: key })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!live) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key]);
  return (
    <div className="tgx">
      <div className="tgx-notif" aria-label="Phone notification">
        <span className="tgx-app">
          <span className="tgx-ava" aria-hidden="true">
            A
          </span>
          AdMate bot · now
        </span>
        <b>
          {digestIcon(d)} {d.headline}
        </b>
        <span>📷 Photo · {d.sub}</span>
      </div>
      <div className="tgx-chat">
        <div className="tgx-msg tgx-photo">
          {src ? (
            // A blob: URL of the server-drawn PNG; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`${d.headline}. ${d.sub}`} width={1080} height={1350} />
          ) : (
            <div className="tgx-ph">{failed ? "The picture couldn’t be drawn. The text version would be sent instead." : "Drawing the picture…"}</div>
          )}
          <p>
            <b>{d.headline}</b>
            <br />
            {d.sub}
          </p>
          <span className="tgx-time">{when}</span>
        </div>
        <div className="tgx-buttons">
          <span>🔎 Open in AdMate</span>
          <span>⚙️ Alert settings</span>
        </div>
      </div>
    </div>
  );
}
