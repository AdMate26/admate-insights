import { useEffect, useState } from "react";
import { Send, Eye, CalendarClock } from "lucide-react";
import { toast } from "sonner";

import {
  getTelegramSchedule,
  previewBriefing,
  saveTelegramSchedule,
  sendTelegramBriefing,
  setTelegramScheduleEnabled,
} from "@/lib/admate.functions";
import { brandMeta, type Brand } from "@/lib/brands";
import {
  browserTimezone,
  WEEKDAY_LABELS,
  type DeliveryType,
} from "@/lib/telegram/schedule-model";
import type { StoredSchedule } from "@/lib/telegram/schedules.server";

type Mode = null | "menu" | DeliveryType;

export function BriefingsView({ brand }: { brand: Brand }) {
  const [chatId, setChatId] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [mode, setMode] = useState<Mode>(null);
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(3); // Wednesday
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [saving, setSaving] = useState(false);

  const [schedule, setSchedule] = useState<StoredSchedule | null>(null);
  const [scheduleConfigured, setScheduleConfigured] = useState(true);

  // Load any existing schedule for this brand (best-effort; preview still works
  // even if storage/Telegram is unavailable).
  useEffect(() => {
    let cancelled = false;
    setMode(null);
    getTelegramSchedule({ data: { brand } })
      .then((res) => {
        if (cancelled) return;
        setScheduleConfigured(res.configured);
        setSchedule(res.schedule);
        if (res.schedule) {
          setTime(res.schedule.time);
          if (res.schedule.weekday != null) setWeekday(res.schedule.weekday);
          if (res.schedule.dayOfMonth != null) setDayOfMonth(res.schedule.dayOfMonth);
        }
      })
      .catch(() => {
        if (!cancelled) setScheduleConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brand]);

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const res = await previewBriefing({ data: { brand } });
      setPreview(res.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const res = await sendTelegramBriefing({ data: { chatId, brand } });
      if (res.ok) toast.success("Briefing sent to Telegram");
      else toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to send to Telegram.");
    } finally {
      setSending(false);
    }
  }

  async function saveSchedule(deliveryType: DeliveryType) {
    setSaving(true);
    try {
      const res = await saveTelegramSchedule({
        data: {
          brand,
          deliveryType,
          time,
          timezone: browserTimezone(),
          weekday: deliveryType === "weekly" ? weekday : null,
          dayOfMonth: deliveryType === "monthly" ? dayOfMonth : null,
        },
      });
      if (res.ok) {
        setSchedule(res.schedule);
        setMode(null);
        toast.success("Telegram briefing scheduled");
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    try {
      const res = await setTelegramScheduleEnabled({ data: { brand, enabled } });
      if (res.ok) {
        setSchedule(res.schedule);
        toast.success(enabled ? "Schedule enabled" : "Schedule disabled");
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update schedule.");
    }
  }

  function startEdit() {
    if (schedule) setMode(schedule.deliveryType);
    else setMode("menu");
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
          problems. Preview it any time, send it now, or schedule it. Times use your browser
          timezone ({browserTimezone()}).
        </p>
      </div>

      <div className="grid-brief">
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Preview & deliver</h2>
            <span className="panel-note">Cross-platform digest</span>
          </div>

          <input
            className="sched-input"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="Telegram chat ID (optional — overrides the default)"
            aria-label="Telegram chat ID"
          />

          {/* Two clear, separate actions. Preview never needs Telegram. */}
          <div className="brief-actions">
            <button className="button-secondary" onClick={loadPreview} disabled={loadingPreview}>
              <Eye size={15} aria-hidden="true" />
              {loadingPreview ? "Building…" : preview ? "Refresh preview" : "Preview Message"}
            </button>
            <button
              className="send-briefing"
              onClick={() => setMode(mode ? null : "menu")}
              aria-expanded={mode != null}
            >
              <CalendarClock size={15} aria-hidden="true" />
              Telegram Send &amp; Schedule
            </button>
          </div>

          {/* Send & Schedule menu */}
          {mode ? (
            <div className="sched-panel">
              <div className="sched-options" role="tablist" aria-label="Delivery">
                <button className="sched-opt" onClick={sendNow} disabled={sending}>
                  <Send size={13} aria-hidden="true" /> {sending ? "Sending…" : "Send Now"}
                </button>
                {(["daily", "weekly", "monthly"] as DeliveryType[]).map((d) => (
                  <button
                    key={d}
                    className={`sched-opt${mode === d ? " is-active" : ""}`}
                    aria-selected={mode === d}
                    onClick={() => setMode(d)}
                  >
                    {d[0].toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>

              {mode !== "menu" ? (
                <div className="sched-form">
                  {mode === "weekly" ? (
                    <label className="sched-field">
                      <span>Send every</span>
                      <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                        {WEEKDAY_LABELS.map((label, i) => (
                          <option key={label} value={i}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {mode === "monthly" ? (
                    <label className="sched-field">
                      <span>Send every month on</span>
                      <select
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Number(e.target.value))}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="sched-field">
                    <span>At</span>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </label>

                  <button className="send-briefing" onClick={() => saveSchedule(mode)} disabled={saving}>
                    {saving ? "Saving…" : "Save Schedule"}
                  </button>
                  {mode === "monthly" ? (
                    <p className="fam-blurb sched-note">
                      Days 29–31 fall back to the last valid day of shorter months.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Existing schedule */}
          {schedule ? (
            <div className="sched-current">
              <div>
                <span className="sched-current-label">Scheduled</span>
                <strong className={schedule.enabled ? "" : "sched-off"}>
                  {schedule.summary}
                  {schedule.enabled ? "" : " (disabled)"}
                </strong>
              </div>
              <div className="sched-current-actions">
                <button className="button-quiet" onClick={startEdit}>
                  Edit
                </button>
                {schedule.enabled ? (
                  <button className="button-quiet" onClick={() => toggleEnabled(false)}>
                    Disable
                  </button>
                ) : (
                  <button className="button-quiet" onClick={() => toggleEnabled(true)}>
                    Enable
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <p className="fam-blurb">
            {scheduleConfigured
              ? "Scheduled briefings run server-side (Supabase Cron) — they keep sending even when this browser is closed. Preview works with or without Telegram connected."
              : "Schedule storage isn’t configured in this environment, so saving a schedule is disabled here — but Preview Message and Send Now still work."}
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
