// frontend/components/Header.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredUser, isAuthenticated, logout } from "@/lib/auth";

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

const NAV_LINKS = [
  { href: "/fests", label: "Discover" },
  { href: "/fests", label: "Fests" },
  { href: "/about", label: "About" },
];

export default function Header() {
  // Auth-dependent bits render only after mount to avoid SSR/hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<StoredUser>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false); // user account dropdown
  const [mobileOpen, setMobileOpen] = useState(false); // mobile nav sheet

  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);

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

  // Close menus on Escape.
  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
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
        Skip to main content
      </a>
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#522C5D] shadow-md">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold shadow-md">
            t
          </div>
          <span className="font-bold text-white">tiqr</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/fests" className="text-white/80 hover:text-white transition-colors">
            Discover
          </Link>
          <Link href="/fests" className="text-white/80 hover:text-white transition-colors">
            Fests
          </Link>
          <Link href="/about" className="text-white/80 hover:text-white transition-colors">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/contact"
            className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-white/80 border border-white/30 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          >
            Support
          </Link>

          {/* Auth-dependent action (desktop). Rendered only after mount. */}
          {!mounted ? null : showUser ? (
            <div className="relative hidden sm:block" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-white text-[#2D1B4E] font-semibold flex items-center justify-center">
                  {initialOf(user)}
                </span>
                <span className="text-sm font-medium text-white max-w-[8rem] truncate">
                  {user.name || user.email}
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 rounded-lg bg-white shadow-lg py-1 text-sm"
                >
                  {dash && (
                    <Link
                      href={dash}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-[#2D1B4E] hover:bg-slate-100"
                    >
                      Dashboard
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-red-600 hover:bg-slate-100"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/signin"
              className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-[#2D1B4E] bg-white rounded-lg hover:bg-white/90 transition-all"
            >
              Sign In
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            ref={mobileButtonRef}
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
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
          className="md:hidden border-t border-white/10 bg-[#3D1B5C] px-4 py-4 space-y-1 text-sm font-medium"
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/contact"
            onClick={() => setMobileOpen(false)}
            className="block px-2 py-2 rounded-lg text-white/90 hover:bg-white/10"
          >
            Support
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
                    Dashboard
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-2 py-2 rounded-lg text-red-200 hover:bg-white/10"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/signin"
                onClick={() => setMobileOpen(false)}
                className="block px-2 py-2 rounded-lg font-semibold text-white bg-white/10 hover:bg-white/20"
              >
                Sign In
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
    </>
  );
}
