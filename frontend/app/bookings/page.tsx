"use client";

import { useEffect, useState } from "react";
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

function formatDate(dateStr?: string) {
  if (!dateStr) return "Date TBA";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const statusStyles: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-slate-200 text-slate-600",
  REFUNDED: "bg-blue-100 text-blue-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        statusStyles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function BookingCard({ booking }: { booking: BookingListItem }) {
  const totalTickets = (booking.items || []).reduce((s, i) => s + i.quantity, 0);
  return (
    <Link
      href={`/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`}
      className="block rounded-lg bg-white border p-5 shadow-sm hover:shadow-md transition-shadow"
      data-testid="booking-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{booking.event?.name || "Event"}</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDate(booking.event?.startDate)}
            {booking.event?.venue ? ` · ${booking.event.venue}` : ""}
          </p>
          <p className="text-xs text-slate-400 mt-1 font-mono">{booking.bookingCode}</p>
        </div>
        <div className="text-right shrink-0">
          <StatusBadge status={booking.status} />
          <div className="font-bold mt-2">{formatPaise(booking.total ?? 0)}</div>
          {totalTickets > 0 && (
            <div className="text-xs text-slate-500">
              {totalTickets} ticket{totalTickets === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function BookingsPage() {
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
        else showToast(data.error?.message || "Could not load your bookings", "error");
      } catch (error) {
        console.error("Failed to fetch bookings:", error);
        showToast("Could not load your bookings", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
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
        showToast(data.error?.message || "No booking found for that code", "error");
      }
    } catch (error) {
      console.error("Lookup failed:", error);
      showToast("Lookup failed. Please try again.", "error");
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
            <h1 className="text-2xl font-extrabold">My bookings</h1>
            <Link href="/fests" className="text-sm text-primary-600 hover:underline">
              Discover events →
            </Link>
          </div>

          {/* Signed-in booking history */}
          {signedIn ? (
            loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-24 bg-gray-200 rounded"></div>
                <div className="h-24 bg-gray-200 rounded"></div>
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-lg bg-white border p-10 text-center shadow-sm" data-testid="empty-state">
                <h2 className="text-lg font-semibold">No bookings yet</h2>
                <p className="text-sm text-slate-500 mt-1">
                  When you book tickets, they&apos;ll show up here.
                </p>
                <Link
                  href="/fests"
                  className="inline-block mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md font-semibold"
                >
                  Discover events
                </Link>
              </div>
            ) : (
              <div className="space-y-3" data-testid="booking-list">
                {bookings.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </div>
            )
          ) : (
            /* Guest: look up by booking code */
            <div className="rounded-lg bg-white border p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Look up a booking</h2>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Enter your booking code to view your tickets. Or{" "}
                <Link href="/signin" className="text-primary-600 hover:underline">
                  sign in
                </Link>{" "}
                to see all your bookings.
              </p>
              <form onSubmit={lookupByCode} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Your booking code"
                  aria-label="Booking code"
                  className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={!code.trim() || lookupLoading}
                  className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {lookupLoading ? "Looking up…" : "Find booking"}
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
