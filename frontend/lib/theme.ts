// frontend/lib/theme.ts
// Shared with components/ThemeToggle.tsx, which is the only writer of the
// "data-theme" attribute + THEME_EVENT. Anything that needs to react to the
// current light/dark theme (without being the toggle button itself) reads
// through here instead of re-deriving its own copy of this logic.

export const THEME_STORAGE_KEY = "FesTicket-theme";
// storage events only fire in OTHER tabs, never the tab that made the change —
// this custom event is how same-tab listeners (e.g. the venue map) hear about
// a toggle click immediately instead of only on next navigation.
export const THEME_EVENT = "festicket-theme-change";

/** The theme currently applied to <html>, resolving the system default. */
export function getCurrentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark" || forced === "light") return forced;
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}
