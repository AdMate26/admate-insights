import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AuthPending } from "@/components/auth/AuthLayout";
import { useLogout } from "@/lib/auth/session";

/**
 * /logout — signs out of both the AdMate dashboard (/app) and Supabase, then
 * returns to the landing page. The dashboard's "Sign out" ends its own session
 * and sends the browser here so the Supabase session ends too.
 */
export const Route = createFileRoute("/logout")({
  ssr: false,
  head: () => ({ meta: [{ title: "Signing out — AdMate" }] }),
  component: Logout,
});

function Logout() {
  const logout = useLogout();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void logout();
  }, [logout]);
  return <AuthPending label="Signing you out…" />;
}
