import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/admate/ThemeToggle";

/** Wordmark reused from the dashboard rail, sized for the marketing header. */
function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="AdMate home">
      <img
        src="/brand/mark-light-bg.svg"
        alt=""
        className="h-7 w-7 dark:hidden"
        width={28}
        height={28}
      />
      <img
        src="/brand/mark-violet.svg"
        alt=""
        className="hidden h-7 w-7 dark:block"
        width={28}
        height={28}
      />
      <span className="text-lg tracking-tight text-foreground">
        Ad<strong className="font-bold">Mate</strong>
      </span>
    </Link>
  );
}

/**
 * Public marketing header. "How it works" and "Pricing" smooth-scroll to their
 * sections; "Login" and "Start Early Access" route to the auth placeholders.
 * Collapses to a toggle menu on mobile.
 */
export function LandingHeader() {
  const [open, setOpen] = useState(false);

  const scrollLinks = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#pricing", label: "Pricing" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Wordmark />

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {scrollLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Login
          </Link>
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1">
            <Link to="/signup">Start Early Access</Link>
          </Button>
        </nav>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open ? (
        <nav
          className="border-t border-border/70 bg-background px-5 py-3 md:hidden"
          aria-label="Mobile"
        >
          <div className="flex flex-col gap-1">
            {scrollLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Login
            </Link>
            <Button asChild className="mt-2 w-full">
              <Link to="/signup" onClick={() => setOpen(false)}>
                Start Early Access
              </Link>
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
