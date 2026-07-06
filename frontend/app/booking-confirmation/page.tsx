"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";
import { showToast } from "@/lib/toast";

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
  attendees?: Array<{ name: string; email: string }>;
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

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />

      <main className="container py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Success banner */}
          <div className="rounded-lg bg-white border p-6 shadow-sm text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold mt-4">Booking confirmed!</h1>
            <p className="text-sm text-slate-500 mt-1">
              {booking.status === "COMPLETED"
                ? "Your tickets are booked. A confirmation has been sent to your email."
                : "Your booking has been created."}
            </p>
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
                    <span>₹{(item.ticketType.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {booking.attendees && booking.attendees.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Attendees</h3>
                <ul className="space-y-1 text-sm">
                  {booking.attendees.map((att, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span>{att.name}</span>
                      <span className="text-slate-500">{att.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-semibold">Amount paid</span>
              <span className="text-xl font-bold" data-testid="confirmation-total">
                ₹{booking.total?.toLocaleString()}
              </span>
            </div>
          </div>

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
