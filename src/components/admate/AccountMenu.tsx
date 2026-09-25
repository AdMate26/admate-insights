import { Link } from "@tanstack/react-router";
import { LayoutGrid, LogOut, Sparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/lib/auth/session";

/** Signed-in user menu: who you are, where to go, and a real Supabase logout. */
export function AccountMenu({ email, mode }: { email: string; mode: "demo" | "workspace" }) {
  const logout = useLogout();
  const initial = email.charAt(0).toUpperCase() || "A";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        aria-label="Account menu"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[0.8rem] font-semibold text-primary-foreground">
          {initial}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mode === "demo" ? (
          <DropdownMenuItem asChild>
            <Link to="/home">
              <LayoutGrid size={14} aria-hidden="true" /> Go to my workspace
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link to="/demo">
              <Sparkles size={14} aria-hidden="true" /> Open the demo
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut size={14} aria-hidden="true" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
