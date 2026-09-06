import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    const followSystem = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("admate-theme");
      } catch {
        /* Storage may be unavailable. */
      }
      if (saved !== "light" && saved !== "dark") {
        document.documentElement.classList.toggle("dark", preference.matches);
        sync();
      }
    };
    sync();
    preference.addEventListener("change", followSystem);
    return () => preference.removeEventListener("change", followSystem);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("admate-theme", next ? "dark" : "light");
    } catch {
      /* Theme still works without persistence. */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun size={17} className="theme-sun" aria-hidden="true" />
      <Moon size={17} className="theme-moon" aria-hidden="true" />
    </button>
  );
}
