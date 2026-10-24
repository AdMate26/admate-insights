"use client";

import { digestIcon, SEV_ICON, type Digest } from "@/lib/analysis/alerts";

// How the alert digest looks on a phone: the lock-screen notification (only its first
// two lines show there), then the message in the chat with its buttons. Rendered from
// the same digest that lib/telegram.ts sends as Telegram HTML.
export function TelegramPreview({ d, when }: { d: Digest; when: string }) {
  let n = 0;
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
        <span>{d.sub}</span>
      </div>
      <div className="tgx-chat">
        <div className="tgx-msg">
          <p>
            {digestIcon(d)} <b>{d.headline}</b>
            <br />
            {d.sub}
          </p>
          {d.groups.map((g) => (
            <div key={g.sev} className="tgx-group">
              <p className="tgx-gt">
                {SEV_ICON[g.sev]} <b>{g.title.toUpperCase()}</b>
              </p>
              {g.items.map((i) => {
                n++;
                return (
                  <p key={i.name + n} className="tgx-item">
                    <b>
                      {n}. {i.name}
                    </b>
                    {i.early && <i> (early sign)</i>}
                    <br />
                    {i.metric} · {i.vs.join(" · ")}
                    {i.money && (
                      <>
                        <br />💸 {i.money}
                      </>
                    )}
                    {i.next && (
                      <>
                        <br />👉 {i.next}
                      </>
                    )}
                  </p>
                );
              })}
            </div>
          ))}
          {d.rules.length > 0 && (
            <div className="tgx-group">
              <p className="tgx-gt">
                📌 <b>YOUR ALERTS</b>
              </p>
              {d.rules.map((r, k) => (
                <p key={k} className="tgx-item">
                  • <b>{r.name}</b>: {r.text} <i>({r.limit})</i>
                </p>
              ))}
            </div>
          )}
          {d.more > 0 && <p>+{d.more} more in AdMate</p>}
          <p>
            <i>Looking back only, not a forecast. AdMate never changes your ads.</i>
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
