"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiFetch, clearAuth, isAuthenticated } from "@/lib/auth";
import { showToast } from "@/lib/toast";

interface Session {
  id: number;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
  expiresAt?: string;
}

// AUTH-02: a rough browser/OS label from the stored user-agent (best-effort — the
// metadata is only for the user to recognise their own devices).
function deviceLabel(ua?: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
    ? "Opera"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/.test(ua)
    ? "iOS"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

function relTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/sessions");
      const data = await res.json();
      if (res.ok && data.success) setSessions(data.data || []);
      else showToast(data.error?.message || "Could not load sessions", "error");
    } catch {
      showToast("Could not load sessions", "error");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/signin");
      return;
    }
    load();
    // Run once on mount; router/load are stable enough and must not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        showToast("Session revoked", "success");
      } else {
        showToast("Could not revoke session", "error");
      }
    } catch {
      showToast("Could not revoke session", "error");
    }
    setBusy(false);
  }

  async function revokeAll() {
    if (busy) return;
    if (!window.confirm("Sign out of all devices? You'll need to sign in again on this one too.")) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/sessions", { method: "DELETE" });
      if (res.ok) {
        // This also revoked the current device's refresh token — clear local auth
        // and send them to sign in.
        clearAuth();
        router.push("/signin");
        return;
      }
      showToast("Could not sign out everywhere", "error");
    } catch {
      showToast("Could not sign out everywhere", "error");
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-extrabold">Active sessions</h1>
            <Link href="/account" className="text-sm text-[var(--text-primary)] hover:underline">
              ← Account
            </Link>
          </div>
          <p className="text-sm text-[var(--text-soft)]">
            Devices where you&apos;re signed in. Revoke any you don&apos;t recognise.
          </p>

          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-16 bg-[var(--surface-slate-200)] rounded" />
              <div className="h-16 bg-[var(--surface-slate-200)] rounded" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg bg-[var(--surface)] border p-8 text-center text-[var(--text-soft)] shadow-sm">
              No active sessions.
            </div>
          ) : (
            <>
              <ul className="space-y-3" data-testid="session-list">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg bg-[var(--surface)] border p-4 shadow-sm flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-slate-800)]">{deviceLabel(s.userAgent)}</p>
                      <p className="text-xs text-[var(--text-soft)] truncate">
                        {s.ipAddress || "Unknown IP"} · signed in {relTime(s.createdAt)}
                      </p>
                      <p className="text-xs text-[var(--text-faint)]">Expires {relTime(s.expiresAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(s.id)}
                      disabled={busy}
                      className="shrink-0 text-sm px-3 py-1.5 rounded-md border border-[var(--border-slate)] text-[var(--text-strong)] hover:bg-[var(--surface-slate)] disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={revokeAll}
                disabled={busy}
                className="text-sm px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold"
              >
                Sign out everywhere
              </button>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
