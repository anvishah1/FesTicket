"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatPaise } from "@/lib/format";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiFetch, getApiUrl, getStoredUser, isAuthenticated } from "@/lib/auth";
import { showToast } from "@/lib/toast";

interface BookingListItem {
  id: number;
  bookingCode: string;
  status: string;
  total: number;
  createdAt?: string;
  event?: {
    id?: number;
    name?: string;
    venue?: string;
    startDate?: string;
    status?: string;
  };
  items?: Array<{ quantity: number; ticketType: { name: string; price: number } }>;
}

function formatDate(dateStr: string | undefined, locale: string, dateTba: string) {
  if (!dateStr) return dateTba;
  return new Date(dateStr).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const statusStyles: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-[var(--surface-slate-200)] text-[var(--text-slate)]",
  REFUNDED: "bg-blue-100 text-blue-700",
};

const statusLabelKeys: Record<string, string> = {
  COMPLETED: "statusCompleted",
  PENDING: "statusPending",
  CANCELLED: "statusCancelled",
  REFUNDED: "statusRefunded",
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("bookings");
  const key = statusLabelKeys[status];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        statusStyles[status] || "bg-[var(--surface-slate-100)] text-[var(--text-slate)]"
      }`}
    >
      {key ? t(key) : status}
    </span>
  );
}

function BookingCard({
  booking,
  onChanged,
}: {
  booking: BookingListItem;
  onChanged: (b: BookingListItem) => void;
}) {
  const t = useTranslations("bookings");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const totalTickets = (booking.items || []).reduce((s, i) => s + i.quantity, 0);
  // PAY-06: a PENDING booking can be cancelled; a COMPLETED one can request a
  // refund (the server enforces the event's refund policy and reports the outcome).
  const canCancel = booking.status === "PENDING";
  const canRefund = booking.status === "COMPLETED";

  const act = async () => {
    if (busy) return;
    if (!window.confirm(canCancel ? t("confirmCancel") : t("confirmRefund"))) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/bookings/${booking.id}/request-refund`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || t("actionDone"), "success");
        onChanged({ ...booking, status: data.data?.status || (canCancel ? "CANCELLED" : "REFUNDED") });
      } else {
        showToast(data.error?.message || t("actionFailed"), "error");
      }
    } catch {
      showToast(t("actionError"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-lg bg-[var(--surface)] border shadow-sm hover:shadow-md transition-shadow"
      data-testid="booking-card"
    >
      <Link
        href={`/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`}
        className="block p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">{booking.event?.name || t("eventFallback")}</h3>
            <p className="text-sm text-[var(--text-soft)] mt-0.5">
              {formatDate(booking.event?.startDate, locale, t("dateTba"))}
              {booking.event?.venue ? ` · ${booking.event.venue}` : ""}
            </p>
            <p className="text-xs text-[var(--text-faint)] mt-1 font-mono">{booking.bookingCode}</p>
          </div>
          <div className="text-right shrink-0">
            <StatusBadge status={booking.status} />
            <div className="font-bold mt-2">{formatPaise(booking.total ?? 0)}</div>
            {totalTickets > 0 && (
              <div className="text-xs text-[var(--text-soft)]">
                {t("ticketCount", { count: totalTickets })}
              </div>
            )}
          </div>
        </div>
      </Link>
      {(canCancel || canRefund) && (
        <div className="px-5 pb-4 -mt-1 flex justify-end gap-2">
          {/* NOTIF-02: let a distracted buyer resume payment on a PENDING booking. */}
          {canCancel && booking.event?.id != null && (
            <Link
              href={`/events/${booking.event.id}/payment?bookingCode=${encodeURIComponent(booking.bookingCode)}`}
              className="text-sm px-3 py-1.5 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold"
              data-testid="complete-payment"
            >
              {t("completePayment")}
            </Link>
          )}
          <button
            type="button"
            onClick={act}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--border-slate)] text-[var(--text-strong)] hover:bg-[var(--surface-slate)] disabled:opacity-50"
          >
            {busy ? t("processing") : canCancel ? t("cancelBooking") : t("requestRefund")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function BookingsPage() {
  const t = useTranslations("bookings");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingListItem[]>([]);

  // Guest lookup state
  const [code, setCode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    const authed = isAuthenticated();
    setSignedIn(authed);

    if (!authed || !user) {
      setLoading(false);
      return;
    }

    const fetchBookings = async () => {
      try {
        const res = await apiFetch(`/api/bookings/user/${user.id}`);
        const data = await res.json();
        if (data.success) setBookings(data.data || []);
        else showToast(data.error?.message || t("loadError"), "error");
      } catch (error) {
        console.error("Failed to fetch bookings:", error);
        showToast(t("loadError"), "error");
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
    // Runs once on mount only — `t` is intentionally excluded so switching the
    // locale mid-visit doesn't re-trigger a bookings refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || lookupLoading) return;
    setLookupLoading(true);
    try {
      // Public guest endpoint keyed by the unguessable bookingCode (no auth).
      const res = await fetch(`${getApiUrl()}/api/bookings/code/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = `/booking-confirmation?bookingCode=${encodeURIComponent(trimmed)}`;
      } else {
        showToast(data.error?.message || t("lookupNotFound"), "error");
      }
    } catch (error) {
      console.error("Lookup failed:", error);
      showToast(t("lookupError"), "error");
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />

      <main className="container py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-extrabold">{t("heading")}</h1>
            <Link href="/fests" className="text-sm text-[var(--text-primary)] hover:underline">
              {t("discoverEvents")}
            </Link>
          </div>

          {/* Signed-in booking history */}
          {signedIn ? (
            loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-24 bg-[var(--surface-slate-200)] rounded"></div>
                <div className="h-24 bg-[var(--surface-slate-200)] rounded"></div>
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-lg bg-[var(--surface)] border p-10 text-center shadow-sm" data-testid="empty-state">
                <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
                <p className="text-sm text-[var(--text-soft)] mt-1">
                  {t("emptyBody")}
                </p>
                <Link
                  href="/fests"
                  className="inline-block mt-4 px-4 py-2 bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white rounded-md font-semibold"
                >
                  {t("emptyCta")}
                </Link>
              </div>
            ) : (
              <div className="space-y-3" data-testid="booking-list">
                {bookings.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onChanged={(updated) =>
                      setBookings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                    }
                  />
                ))}
              </div>
            )
          ) : (
            /* Guest: look up by booking code */
            <div className="rounded-lg bg-[var(--surface)] border p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{t("lookupTitle")}</h2>
              <p className="text-sm text-[var(--text-soft)] mt-1 mb-4">
                {t("lookupBodyPrefix")}{" "}
                <Link href="/signin" className="text-[var(--text-primary)] hover:underline">
                  {t("signIn")}
                </Link>{" "}
                {t("lookupBodySuffix")}
              </p>
              <form onSubmit={lookupByCode} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("bookingCodePlaceholder")}
                  aria-label={t("bookingCodeAria")}
                  className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-[var(--ring-plum)] focus:border-[var(--border-plum)] font-mono"
                />
                <button
                  type="submit"
                  disabled={!code.trim() || lookupLoading}
                  className="px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {lookupLoading ? t("lookingUp") : t("findBooking")}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
