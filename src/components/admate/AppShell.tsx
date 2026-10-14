import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, ListChecks, BellRing, Send, FileText, Circle, Store } from "lucide-react";
import { toast } from "sonner";

import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";
import { sendTelegramBriefing } from "@/lib/admate.functions";
import { useAuthSession } from "@/lib/auth/session";
import { BRANDS, brandMeta, type Brand } from "@/lib/brands";
import { platformMeta, type Platform } from "@/lib/platforms";

export type ViewKey = "overview" | "campaigns" | "alerts" | "briefings" | "reports";

/** "demo" = public /demo; "workspace" = signed-in /home. */
export type ShellMode = "demo" | "workspace";

const NAV: { key: ViewKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "All accounts", icon: LayoutGrid },
  { key: "campaigns", label: "Campaigns", icon: ListChecks },
  { key: "alerts", label: "Alerts", icon: BellRing },
  { key: "briefings", label: "Schedule & Send", icon: Send },
  { key: "reports", label: "Client reports", icon: FileText },
];

export function AppShell({
  mode,
  active,
  brand,
  platform,
  onSelectBrand,
  railNote,
  children,
}: {
  mode: ShellMode;
  active: ViewKey;
  brand: Brand;
  platform: Platform;
  onSelectBrand: (brand: Brand) => void;
  railNote?: string;
  children: React.ReactNode;
}) {
  const auth = useAuthSession();
  const [sending, setSending] = useState(false);
  const activeBrand = brandMeta(brand);
  // Navigation stays inside the current surface: the demo never links into the
  // protected workspace, and the workspace never drops back into the demo.
  const basePath = mode === "demo" ? "/demo" : "/home";

  async function sendNow() {
    setSending(true);
    try {
      const res = await sendTelegramBriefing({ data: { brand } });
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
        <Link
          to={basePath}
          search={{ view: "overview", brand, platform }}
          className="rail-brand"
          aria-label="AdMate"
        >
          <img
            src="/brand/mark-light-bg.svg"
            alt=""
            className="brand-mark brand-mark-light"
            width="30"
            height="30"
          />
          <img
            src="/brand/mark-violet.svg"
            alt=""
            className="brand-mark brand-mark-dark"
            width="30"
            height="30"
          />
          <span className="brand-wordmark">
            Ad<strong>Mate</strong>
          </span>
        </Link>
        <div className="rail-nav">
          {NAV.map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              to={basePath}
              search={{ view: key, brand, platform }}
              className={`nav-item${active === key ? " is-active" : ""}`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}

          <div className="rail-divider" role="separator" />
          <p className="rail-heading">Brands</p>
          <div className="rail-brands" role="tablist" aria-label="Brands">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === brand}
                className={`nav-item nav-brand${b.id === brand ? " is-active" : ""}`}
                onClick={() => onSelectBrand(b.id)}
                title={b.blurb}
              >
                <Store size={16} aria-hidden="true" />
                {b.label}
              </button>
            ))}
          </div>
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
          {mode === "demo" ? (
            <span className="demo-badge" title="You are exploring AdMate with synthetic demo data">
              <Circle size={7} className="live-dot" aria-hidden="true" /> Demo Mode
            </span>
          ) : (
            <span
              className="demo-badge"
              title="Showing sample data until you connect your ad accounts"
            >
              Sample data
            </span>
          )}
          <div className="scope">
            <span className="scope-label">Brand</span>
            <span className="scope-value">{activeBrand.label}</span>
          </div>
          <div className="scope">
            <span className="scope-label">Connected</span>
            <span className="scope-value">
              {activeBrand.platforms.map((p) => platformMeta(p).label.split(" ")[0]).join(" · ")}
            </span>
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
          {/* Nothing until the session is known, so logged-in users never see a
              login prompt flash (and vice versa). */}
          {auth.status === "authenticated" && auth.user ? (
            <AccountMenu email={auth.user.email ?? "Account"} mode={mode} />
          ) : auth.status === "unauthenticated" ? (
            <Link to="/login" className="button-quiet">
              Login / Sign up
            </Link>
          ) : null}
        </div>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
