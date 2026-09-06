import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ArrowLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PLATFORM, PLATFORMS, platformMeta, type Platform } from "@/lib/platforms";

type Props = {
  /** Optional back link shown on the analysis view. */
  back?: { label: string };
  /** Currently selected demo platform. */
  platform?: Platform;
};

export function AdMateHeader({ back, platform = DEFAULT_PLATFORM }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  // Switching platform returns to the campaign list for that platform. The demo
  // analysis screen is unchanged — only the data source behind it changes.
  function handlePlatformChange(next: Platform) {
    navigate({ to: "/home", search: { platform: next } });
  }

  const mode = platformMeta(platform).modeLabel;

  return (
    <header className="admate-header">
      <div className="admate-container header-content">
        <Link
          to="/home"
          search={{ platform }}
          className="brand-lockup"
          aria-label="AdMate campaigns"
        >
          <img
            src="/brand/mark-light-bg.svg"
            alt=""
            className="brand-mark brand-mark-light"
            width="36"
            height="36"
          />
          <img
            src="/brand/mark-violet.svg"
            alt=""
            className="brand-mark brand-mark-dark"
            width="36"
            height="36"
          />
          <span className="brand-wordmark">
            Ad<strong>Mate</strong>
          </span>
        </Link>
        <div className="header-controls">
          <div className="platform-control">
            <label htmlFor="platform-select" className="eyebrow">
              Platform
            </label>
            <div className="platform-select-wrap">
              <select
                id="platform-select"
                aria-label="Demo platform"
                value={platform}
                onChange={(e) => handlePlatformChange(e.target.value as Platform)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </div>
          <Link to="/connect" className="button-secondary connect-action">
            Connect Ads <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <ThemeToggle />
          {signedIn ? (
            <button type="button" onClick={handleSignOut} className="button-quiet">
              Sign out
            </button>
          ) : null}
        </div>
      </div>
      <div className="header-context admate-container">
        {back ? (
          <Link to="/home" search={{ platform }} className="back-link">
            <ArrowLeft size={14} aria-hidden="true" />
            {back.label}
          </Link>
        ) : (
          <span className="eyebrow">Your marketing, understood.</span>
        )}
        <span className="demo-label">
          <span aria-hidden="true" className="demo-dot" />
          {mode}
        </span>
      </div>
    </header>
  );
}
