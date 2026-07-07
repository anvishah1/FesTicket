"use client";

import { useEffect, useState } from "react";
import { formatPaise } from "@/lib/format";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";
import { showToast } from "@/lib/toast";
import { QRCodeSVG } from "qrcode.react";

interface ConfirmationBooking {
  id: number;
  bookingCode: string;
  status?: string;
  subtotal?: number;
  discount?: number;
  platformFee?: number;
  tax?: number;
  total: number;
  guestName?: string | null;
  guestEmail?: string | null;
  event?: {
    name?: string;
    venue?: string;
    startDate?: string;
  };
  items?: Array<{
    quantity: number;
    ticketType: { name: string; price: number };
  }>;
  attendees?: Array<{ name: string; email: string; ticketCode?: string }>;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "Date TBA";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BookingConfirmationPage() {
  const searchParams = useSearchParams();
  const bookingCode = searchParams.get("bookingCode");

  const [booking, setBooking] = useState<ConfirmationBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingCode) {
        setLoading(false);
        return;
      }
      try {
        // Public guest endpoint keyed by the unguessable bookingCode (no auth).
        const res = await fetch(`${getApiUrl()}/api/bookings/code/${encodeURIComponent(bookingCode)}`);
        const data = await res.json();
        if (data.success) setBooking(data.data);
      } catch (error) {
        console.error("Failed to fetch booking:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [bookingCode]);

  const copyCode = async () => {
    if (!booking?.bookingCode) return;
    try {
      await navigator.clipboard.writeText(booking.bookingCode);
      setCopied(true);
      showToast("Booking code copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy. Please copy the code manually.", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header />
        <main className="container py-10">
          <div className="animate-pulse space-y-4 max-w-2xl mx-auto">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header />
        <main className="container py-10 text-center">
          <h1 className="text-2xl font-bold">Booking not found</h1>
          <p className="text-slate-500 mt-2">
            We couldn&apos;t find a booking for that code.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link href="/bookings" className="px-4 py-2 bg-primary-600 text-white rounded-md">
              Look up a booking
            </Link>
            <Link href="/fests" className="px-4 py-2 border rounded-md">
              Discover events
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const totalTickets = (booking.items || []).reduce((s, i) => s + i.quantity, 0);

  // The confirmation view must reflect the ACTUAL booking status — never show a
  // green "confirmed / amount paid" banner for a PENDING or CANCELLED booking.
  const isCompleted = booking.status === "COMPLETED";
  const isCancelled = booking.status === "CANCELLED";
  const statusUi = isCompleted
    ? {
        title: "Booking confirmed!",
        sub: "Your tickets are booked. A confirmation has been sent to your email.",
        ring: "bg-green-100",
        icon: "text-green-600",
        iconPath: "M20 6L9 17l-5-5",
        amountLabel: "Amount paid",
      }
    : isCancelled
    ? {
        title: "Booking cancelled",
        sub: "This booking was cancelled. No payment is due.",
        ring: "bg-red-100",
        icon: "text-red-600",
        iconPath: "M6 18L18 6M6 6l12 12",
        amountLabel: "Amount",
      }
    : {
        title: "Payment pending",
        sub: "Your booking is reserved but not yet paid. Complete payment to confirm your tickets.",
        ring: "bg-amber-100",
        icon: "text-amber-600",
        iconPath: "M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3.1l-8-14a2 2 0 00-3.4 0z",
        amountLabel: "Amount due",
      };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />

      <main className="container py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Success banner */}
          <div className="rounded-lg bg-white border p-6 shadow-sm text-center">
            <div className={`mx-auto w-14 h-14 rounded-full ${statusUi.ring} flex items-center justify-center`}>
              <svg className={`w-7 h-7 ${statusUi.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d={statusUi.iconPath} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold mt-4">{statusUi.title}</h1>
            <p className="text-sm text-slate-500 mt-1">{statusUi.sub}</p>
          </div>

          {/* Booking code */}
          <div className="rounded-lg bg-white border p-6 shadow-sm">
            <h2 className="text-sm font-medium text-slate-500">Your booking code</h2>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span
                data-testid="booking-code"
                className="font-mono text-xl font-bold tracking-wide break-all"
              >
                {booking.bookingCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="shrink-0 px-3 py-2 text-sm rounded-md border hover:bg-slate-50"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Keep this code — you can use it to look up your booking any time.
            </p>
            {/* TIX-01: scannable QR of the booking code — your pass at entry. */}
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="bg-white p-3 rounded-lg border" data-testid="booking-qr">
                <QRCodeSVG value={booking.bookingCode} size={160} />
              </div>
              <p className="text-xs text-slate-500">Show this QR at the entrance.</p>
            </div>
          </div>

          {/* Event + tickets */}
          <div className="rounded-lg bg-white border p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{booking.event?.name || "Event"}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {formatDate(booking.event?.startDate)}
                {booking.event?.venue ? ` · ${booking.event.venue}` : ""}
              </p>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-slate-500 mb-2">
                Tickets ({totalTickets})
              </h3>
              <div className="space-y-2 text-sm">
                {(booking.items || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{item.ticketType.name} × {item.quantity}</span>
                    <span>{formatPaise(item.ticketType.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>

            {booking.attendees && booking.attendees.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Attendees</h3>
                <ul className="space-y-3 text-sm">
                  {booking.attendees.map((att, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate">{att.name}</p>
                        <p className="text-slate-500 truncate">{att.email}</p>
                      </div>
                      {/* TIX-02: each attendee gets their own scannable ticket QR. */}
                      {att.ticketCode && (
                        <div className="shrink-0 bg-white p-1.5 rounded border" data-testid="attendee-qr">
                          <QRCodeSVG value={att.ticketCode} size={64} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-semibold">{statusUi.amountLabel}</span>
              <span className="text-xl font-bold" data-testid="confirmation-total">
                {formatPaise(booking.total ?? 0)}
              </span>
            </div>
          </div>

          {/* PAY-07: a paid/refunded booking can download its GST invoice PDF. */}
          {(booking.status === "COMPLETED" || booking.status === "REFUNDED") && (
            <a
              href={`${getApiUrl()}/api/bookings/${booking.id}/invoice?code=${encodeURIComponent(booking.bookingCode)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center px-4 py-3 mb-3 rounded-md border border-primary-600 text-primary-700 hover:bg-primary-50 font-semibold"
            >
              Download tax invoice (PDF)
            </a>
          )}

          {/* TIX-05: print / save the per-attendee tickets. */}
          <Link
            href={`/tickets/${encodeURIComponent(booking.bookingCode)}`}
            className="block text-center px-4 py-3 mb-3 rounded-md border border-primary-600 text-primary-700 hover:bg-primary-50 font-semibold"
          >
            Print / download tickets
          </Link>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/bookings"
              className="flex-1 text-center px-4 py-3 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold"
            >
              View my bookings
            </Link>
            <Link
              href="/fests"
              className="flex-1 text-center px-4 py-3 rounded-md border hover:bg-slate-50 font-semibold"
            >
              Discover more events
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
