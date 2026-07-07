"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { getApiUrl } from "@/lib/auth";

interface TicketBooking {
  bookingCode: string;
  event?: { name?: string; venue?: string; startDate?: string };
  attendees?: Array<{ name: string; email: string; ticketCode: string; ticketType?: string }>;
  items?: Array<{ quantity: number; ticketType: { name: string } }>;
}

function fmtDate(s?: string) {
  if (!s) return "Date TBA";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "Date TBA"
    : d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}

// TIX-05: print-optimized ticket route. One card per attendee (QR + details),
// with @media print rules (via Tailwind print: variants) so a browser
// print/save-as-PDF yields a clean pass. Reuses the public code lookup.
export default function TicketsPage() {
  const params = useParams();
  const bookingCode = String(params?.bookingCode || "");
  const [booking, setBooking] = React.useState<TicketBooking | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (!bookingCode) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/bookings/code/${encodeURIComponent(bookingCode)}`);
        const data = await res.json();
        if (res.ok && data.success && data.data) setBooking(data.data);
        else setNotFound(true);
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    })();
  }, [bookingCode]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (notFound || !booking)
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Booking not found.</div>;

  // One ticket per attendee; fall back to a single order-level ticket (TIX-01) when
  // no attendees were captured.
  const tickets =
    booking.attendees && booking.attendees.length > 0
      ? booking.attendees.map((a) => ({ code: a.ticketCode, name: a.name as string | undefined, ticketType: a.ticketType }))
      : [{ code: booking.bookingCode, name: undefined as string | undefined, ticketType: booking.items?.[0]?.ticketType?.name }];

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="max-w-2xl mx-auto p-6 print:p-0">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link
            href={`/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`}
            className="text-sm text-primary-600 hover:underline"
          >
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold"
          >
            Print / Save as PDF
          </button>
        </div>

        <div className="space-y-6 print:space-y-0">
          {tickets.map((t, idx) => (
            <div
              key={idx}
              data-testid="printable-ticket"
              className={`bg-white rounded-xl border p-6 shadow-sm print:shadow-none print:rounded-none ${
                idx < tickets.length - 1 ? "break-after-page" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-extrabold text-slate-900">{booking.event?.name || "Event"}</h1>
                  <p className="text-sm text-slate-600 mt-1">{fmtDate(booking.event?.startDate)}</p>
                  {booking.event?.venue && <p className="text-sm text-slate-600">{booking.event.venue}</p>}
                  {t.name && <p className="mt-3 font-semibold">{t.name}</p>}
                  {t.ticketType && <p className="text-sm text-slate-500">{t.ticketType}</p>}
                  <p className="mt-3 text-xs font-mono text-slate-500 break-all">{booking.bookingCode}</p>
                </div>
                <div className="bg-white p-2 rounded border shrink-0">
                  <QRCodeSVG value={t.code} size={132} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
