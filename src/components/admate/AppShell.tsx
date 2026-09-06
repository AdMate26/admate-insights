import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutGrid, ListChecks, BellRing, Send, FileText, Circle } from "lucide-react";
import { toast } from "sonner";

import { ThemeToggle } from "./ThemeToggle";
import { sendTelegramBriefing } from "@/lib/admate.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Platform } from "@/lib/platforms";

export type ViewKey = "overview" | "campaigns" | "alerts" | "briefings" | "reports";

const NAV: { key: ViewKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "All accounts", icon: LayoutGrid },
  { key: "campaigns", label: "Campaigns", icon: ListChecks },
  { key: "alerts", label: "Alerts", icon: BellRing },
  { key: "briefings", label: "Briefings", icon: Send },
  { key: "reports", label: "Client reports", icon: FileText },
];

export function AppShell({
  active,
  platform,
  railNote,
  children,
}: {
  active: ViewKey;
  platform: Platform;
  railNote?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  async function sendNow() {
    setSending(true);
    try {
      const res = await sendTelegramBriefing({ data: {} });
      if (res.ok) toast.success("Briefing sent to Telegram");
      else toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send briefing");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Primary">
        <Link to="/home" search={{ view: "overview", platform }} className="rail-brand" aria-label="AdMate">
          <img src="/brand/mark-light-bg.svg" alt="" className="brand-mark brand-mark-light" width="30" height="30" />
          <img src="/brand/mark-violet.svg" alt="" className="brand-mark brand-mark-dark" width="30" height="30" />
          <span className="brand-wordmark">
            Ad<strong>Mate</strong>
          </span>
        </Link>
        <div className="rail-nav">
          {NAV.map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              to="/home"
              search={{ view: key, platform }}
              className={`nav-item${active === key ? " is-active" : ""}`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
        <div className="rail-foot">
          <span className="live-status">
            <Circle size={8} className="live-dot" aria-hidden="true" /> Live · synthetic demo
          </span>
          {railNote ? <p>{railNote}</p> : null}
        </div>
      </nav>

      <div className="shell-main">
        <div className="topbar">
          <div className="scope">
            <span className="scope-label">Showing</span>
            <span className="scope-value">All platforms</span>
          </div>
          <div className="scope">
            <span className="scope-label">Window</span>
            <span className="scope-value">Last 7 days</span>
          </div>
          <div className="topbar-spacer" />
          <ThemeToggle />
          <button type="button" className="send-briefing" onClick={sendNow} disabled={sending}>
            <Send size={14} aria-hidden="true" />
            {sending ? "Sending…" : "Send briefing now"}
          </button>
          {signedIn ? (
            <button type="button" onClick={handleSignOut} className="button-quiet">
              Sign out
            </button>
          ) : null}
        </div>
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
