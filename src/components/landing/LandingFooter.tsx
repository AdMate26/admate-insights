import { Link } from "@tanstack/react-router";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <img
              src="/brand/mark-light-bg.svg"
              alt=""
              className="h-6 w-6 dark:hidden"
              width={24}
              height={24}
            />
            <img
              src="/brand/mark-violet.svg"
              alt=""
              className="hidden h-6 w-6 dark:block"
              width={24}
              height={24}
            />
            <span className="text-foreground">
              Ad<strong className="font-bold">Mate</strong>
            </span>
          </div>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            AI marketing analyst that monitors campaigns by objective and tells you what to do next.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Footer">
          <a href="/#how-it-works" className="text-muted-foreground hover:text-foreground">
            How it works
          </a>
          <Link to="/demo" className="text-muted-foreground hover:text-foreground">
            Try AdMate
          </Link>
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            Login / Sign up
          </Link>
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="text-muted-foreground hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>

      <div className="border-t border-border/70">
        <div className="mx-auto w-full max-w-6xl px-5 py-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AdMate. Early Access.
          </p>
        </div>
      </div>
    </footer>
  );
}
