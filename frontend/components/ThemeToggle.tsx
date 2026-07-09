// frontend/components/ThemeToggle.tsx
// FE-11: light/dark theme toggle. The chosen theme is written to
// localStorage["FesTicket-theme"] and reflected as <html data-theme="…">, which the
// token blocks in globals.css key off. With no stored choice the app follows
// prefers-color-scheme (handled purely in CSS + the no-flash script in layout).
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export const THEME_STORAGE_KEY = "FesTicket-theme";

/** The theme currently applied to <html>, resolving the system default. */
function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark" || forced === "light") return forced;
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("theme");
  // SSR and the first client render both assume light so the markup matches;
  // the real theme is resolved in the effect below (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    setTheme(currentTheme());
    // Keep in sync if another tab (or the no-flash script) changes the choice.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setTheme(currentTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback(() => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode) — the attribute still applies */
    }
    setTheme(next);
  }, []);

  const isDark = mounted && theme === "dark";
  const label = isDark ? t("toLight") : t("toDark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className={
        "inline-flex items-center justify-center w-10 h-10 rounded-lg " +
        "text-white/80 hover:text-white hover:bg-white/10 transition-colors " +
        className
      }
    >
      {/* Sun when dark (tap to go light); moon when light (tap to go dark). */}
      {isDark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
