import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

type Props = {
  /** Optional back link shown on the analysis view. */
  back?: { label: string };
};

export function AdMateHeader({ back }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {back ? (
            <Link
              to="/home"
              className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {back.label}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AdMate</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI Marketing Analyst Platform</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <dl className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
              <dt className="uppercase tracking-wide text-muted-foreground">Platform</dt>
              <dd className="font-medium text-foreground">TikTok Ads</dd>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
              <dt className="uppercase tracking-wide text-muted-foreground">Mode</dt>
              <dd className="font-medium text-foreground">Demo Data</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
