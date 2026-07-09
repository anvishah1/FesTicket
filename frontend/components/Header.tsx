// frontend/components/Header.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getStoredUser, isAuthenticated, logout } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";

type StoredUser = ReturnType<typeof getStoredUser>;

/** Where a given role's dashboard lives, or null if the role has no dashboard. */
function dashboardHref(role?: string): string | null {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "EDITOR" || role === "HOST") return "/host/dashboard";
  return null;
}

function initialOf(user: NonNullable<StoredUser>): string {
  const source = (user.name || user.email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

// FE-12: labels are resolved from the dictionary at render time (t("nav.…")).
const NAV_LINKS = [
  { href: "/fests", key: "discover" },
  { href: "/about", key: "about" },
] as const;

// FE-14: everything the mobile sheet's focus trap must contain — note `select`
// (the LocaleSwitcher) and inputs, not just links/buttons.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), select, input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

export default function Header() {
  const t = useTranslations();
  // Auth-dependent bits render only after mount to avoid SSR/hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<StoredUser>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false); // user account dropdown
  const [mobileOpen, setMobileOpen] = useState(false); // mobile nav sheet

  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavRef = useRef<HTMLElement | null>(null);

  // FE-14: roving-tabindex arrow navigation + focus management for the account
  // menu. Reads the live menuitem set so it doesn't matter which items render.
  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = menuItems();
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Tabbing out closes the menu and returns focus to the trigger.
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  };

  // FE-14: focus the first menu item when the account dropdown opens.
  useEffect(() => {
    if (!menuOpen) return;
    menuItems()[0]?.focus();
  }, [menuOpen]);

  // FE-14: lock body scroll + focus the first control when the mobile sheet opens.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileNavRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  // FE-14: focus trap for the mobile sheet (Tab cycles within it).
  const onMobileKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusables = Array.from(mobileNavRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const syncAuth = useCallback(() => {
    setLoggedIn(isAuthenticated());
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    setMounted(true);
    syncAuth();
    // React to auth changes from other tabs and from same-tab login/logout.
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, [syncAuth]);

  // Close menus on Escape, restoring focus to whichever trigger opened them.
  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (menuOpen) menuButtonRef.current?.focus();
        else if (mobileOpen) mobileButtonRef.current?.focus();
        setMenuOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, mobileOpen]);

  // Close the account dropdown when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    setMobileOpen(false);
    await logout();
    setLoggedIn(false);
    setUser(null);
    window.location.href = "/";
  }

  const dash = dashboardHref(user?.role);
  const showUser = mounted && loggedIn && user;

  return (
    <>
      {/* First focusable element on the page: lets keyboard/SR users jump
          past the nav straight to the page's <main id="main-content">. */}
      <a href="#main-content" className="skip-link">
        {t("header.skipToContent")}
      </a>
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#522C5D] shadow-md">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold shadow-md">
            t
          </div>
          <span className="font-bold text-white">FesTicket</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/fests" className="text-white/80 hover:text-white transition-colors">
            {t("nav.discover")}
          </Link>
          <Link href="/about" className="text-white/80 hover:text-white transition-colors">
            {t("nav.about")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* FE-11: light/dark theme toggle — visible on every breakpoint. */}
          <ThemeToggle />

          {/* FE-12: locale switcher (desktop). */}
          <LocaleSwitcher className="hidden sm:inline-flex" />

          <Link
            href="/contact"
            className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-white/80 border border-white/30 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          >
            {t("nav.support")}
          </Link>

          {/* NOTIF-08: in-app notification bell (desktop, logged-in only). */}
          {mounted && showUser && (
            <div className="hidden sm:block">
              <NotificationBell />
            </div>
          )}

          {/* Auth-dependent action (desktop). Rendered only after mount. */}
          {!mounted ? null : showUser ? (
            <div className="relative hidden sm:block" ref={menuRef}>
              <button
                type="button"
                ref={menuButtonRef}
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-[var(--surface)] text-[var(--text-primary)] font-semibold flex items-center justify-center">
                  {initialOf(user)}
                </span>
                <span className="text-sm font-medium text-white max-w-[8rem] truncate">
                  {user.name || user.email}
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  onKeyDown={onMenuKeyDown}
                  className="absolute right-0 mt-2 w-48 rounded-lg bg-[var(--surface)] shadow-lg py-1 text-sm"
                >
                  {dash && (
                    <Link
                      href={dash}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-slate-100)]"
                    >
                      {t("account.dashboard")}
                    </Link>
                  )}
                  <Link
                    href="/bookings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-slate-100)]"
                  >
                    {t("account.myBookings")}
                  </Link>
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-slate-100)]"
                  >
                    {t("account.account")}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-red-600 hover:bg-[var(--surface-slate-100)]"
                  >
                    {t("account.logOut")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/signin"
              className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface)] rounded-lg hover:bg-[var(--surface-tint)] transition-all"
            >
              {t("nav.signIn")}
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            ref={mobileButtonRef}
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={t("header.toggleNav")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-white hover:bg-white/10 transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav sheet */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          ref={mobileNavRef}
          onKeyDown={onMobileKeyDown}
          className="md:hidden border-t border-white/10 bg-[#3D1B5C] px-4 py-4 space-y-1 text-sm font-medium"
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
            >
              {t(`nav.${l.key}`)}
            </Link>
          ))}
          <Link
            href="/contact"
            onClick={() => setMobileOpen(false)}
            className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
          >
            {t("nav.support")}
          </Link>

          <div className="pt-2 mt-2 border-t border-white/10">
            {!mounted ? null : showUser ? (
              <>
                {dash && (
                  <Link
                    href={dash}
                    onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
                  >
                    {t("account.dashboard")}
                  </Link>
                )}
                <Link
                  href="/bookings"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
                >
                  {t("account.myBookings")}
                </Link>
                <Link
                  href="/account"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
                >
                  {t("account.account")}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-2 py-2 rounded-lg text-red-200 hover:bg-white/10"
                >
                  {t("account.logOut")}
                </button>
              </>
            ) : (
              <Link
                href="/signin"
                onClick={() => setMobileOpen(false)}
                className="block px-2 py-2 rounded-lg font-semibold text-white bg-white/10 hover:bg-white/20"
              >
                {t("nav.signIn")}
              </Link>
            )}
          </div>

          {/* FE-12: locale switcher (mobile sheet). */}
          <div className="pt-2 mt-2 border-t border-white/10">
            <LocaleSwitcher className="w-full" />
          </div>
        </nav>
      )}
    </header>
    </>
  );
}
