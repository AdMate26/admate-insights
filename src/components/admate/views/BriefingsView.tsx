import { useState } from "react";
import { toast } from "sonner";

import { previewBriefing, sendTelegramBriefing } from "@/lib/admate.functions";
import { brandMeta, type Brand } from "@/lib/brands";

export function BriefingsView({ brand }: { brand: Brand }) {
  const [chatId, setChatId] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await previewBriefing({ data: { brand } });
      setPreview(res.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build preview");
    } finally {
      setLoading(false);
    }
  }
  async function send() {
    setSending(true);
    try {
      const res = await sendTelegramBriefing({ data: { chatId, brand } });
      if (res.ok) toast.success("Briefing sent to Telegram");
      else toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send briefing");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="br-title">
      <div className="view-head">
        <h1 className="view-title" id="br-title">
          Briefings, on your schedule
        </h1>
        <p className="view-sub">
          AdMate writes a summary for {brandMeta(brand).label} across its connected platforms, from
          the same engine that powers the dashboard — only campaigns rated Low, plus tracking
          problems — and sends it to Telegram.
        </p>
      </div>

      <div className="grid-brief">
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Send now</h2>
            <span className="panel-note">Cross-platform digest</span>
          </div>
          <div className="brief-controls">
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Telegram chat ID (optional)"
              aria-label="Telegram chat ID"
            />
            <button className="send-briefing" onClick={send} disabled={sending}>
              {sending ? "Sending…" : "Send to Telegram"}
            </button>
            <button className="button-secondary" onClick={loadPreview} disabled={loading}>
              {loading ? "Building…" : preview ? "Refresh preview" : "Preview"}
            </button>
          </div>
          <p className="fam-blurb">
            Telegram delivery is not connected in the demo — use Preview to see the exact message.
          </p>
          {preview ? <pre className="briefing-preview">{preview}</pre> : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">What goes in the briefing</h2>
          </div>
          <ul className="brief-list">
            <li>Header: how many campaigns need attention, per platform.</li>
            <li>Full detail for each Low campaign: signal, key evidence, one action.</li>
            <li>Tracking/data problems listed separately.</li>
            <li>A compact count of In Review campaigns; High/Moderate omitted.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
