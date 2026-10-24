import Link from "next/link";
import type { ReactNode } from "react";
import { loadSampleData } from "@/app/actions";
import { signOut } from "@/app/(auth)/actions";
import { listWorkspaces } from "@/lib/data/workspaces";
import { requireUser } from "@/lib/auth/session";

// The frame for pages outside an ad account (the start page, "Add an ad account"):
// the same sidebar look as the account pages, with the person's accounts.
export async function Shell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const accounts = await listWorkspaces();
  return (
    <div className="v5" id="v5root">
      <div className="frame">
        <aside className="side" aria-label="AdMate">
          <Link className="wordmark" href="/" aria-label="AdMate home">
            <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M6 58 L25 6 L39 6 L58 58 L44 58 L32 25.2 L20 58 Z" fill="var(--violet)" />
              <rect x="21" y="30.7" width="22" height="11" rx="5.5" fill="var(--signal)" />
            </svg>
            <span>
              <span className="ad">Ad</span>
              <span className="mate">Mate</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Your ad accounts">
            {accounts.length > 0 && <span className="grp">Your ad accounts</span>}
            {accounts.map((a) => (
              <Link key={a.id} className="navbtn" href={`/c/${a.id}`}>
                <span>{a.name}</span>
                {a.isSample && <span className="count soft">sample</span>}
              </Link>
            ))}
            <Link className="navbtn" href="/accounts/new" style={{ color: "var(--violet)" }}>
              <span>+ Add an ad account</span>
            </Link>
          </nav>
          <div className="side-foot">
            <form action={loadSampleData}>
              <button type="submit">{accounts.some((a) => a.isSample) ? "Reset the sample account" : "Explore the sample account"}</button>
            </form>
            <span className="user" title={user.email}>
              {user.email}
            </span>
            <form action={signOut}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        </aside>
        <main className="main">
          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}
