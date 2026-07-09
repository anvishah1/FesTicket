"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/auth";

// NOTIF-08: header bell with an unread badge + dropdown of recent in-app
// notifications. Fetches on mount + light polling (paused when the tab is
// hidden). Best-effort — any fetch error just leaves the list empty.
type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 60_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications?limit=15", {}, { redirectOnAuthFailure: false });
      if (!res.ok) return;
      const body = await res.json();
      if (body?.data) {
        setItems(body.data.notifications || []);
        setUnread(body.data.unreadCount || 0);
      }
    } catch {
      /* leave state as-is */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await apiFetch("/api/notifications/read-all", { method: "PATCH" }, { redirectOnAuthFailure: false });
    } catch {
      /* optimistic — reload on next poll */
    }
  };

  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await apiFetch(`/api/notifications/${n.id}`, { method: "PATCH" }, { redirectOnAuthFailure: false });
      } catch {
        /* optimistic */
      }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
        data-testid="notification-bell"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center"
            data-testid="notification-badge"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-lg bg-[var(--surface)] shadow-lg text-sm overflow-hidden z-30"
          data-testid="notification-dropdown"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="font-semibold text-[var(--text-primary)]">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs text-[var(--text-primary)] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[var(--text-faint)]">You're all caught up.</p>
            ) : (
              items.map((n) => {
                const inner = (
                  <div className={`px-4 py-3 border-b last:border-0 hover:bg-[var(--surface-slate)] ${n.read ? "" : "bg-[color-mix(in_srgb,var(--surface-page)_50%,transparent)]"}`}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--fill-ink)] shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text-primary)] truncate">{n.title}</p>
                        {n.body && <p className="text-[var(--text-soft)] text-xs mt-0.5">{n.body}</p>}
                      </div>
                    </div>
                  </div>
                );
                return n.linkUrl ? (
                  <Link key={n.id} href={n.linkUrl} onClick={() => openItem(n)} data-testid="notification-item">
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    className="block w-full text-left"
                    data-testid="notification-item"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
