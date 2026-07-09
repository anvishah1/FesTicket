"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { getApiUrl } from "@/lib/auth";

interface TicketBooking {
  bookingCode: string;
  status?: string;
  event?: { name?: string; venue?: string; startDate?: string };
  attendees?: Array<{ id?: number; name: string; email: string; ticketCode: string; ticketType?: string; checkedInAt?: string | null }>;
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
  // TIX-06: transfer modal state.
  const [transfer, setTransfer] = React.useState<{ id: number; name: string; email: string } | null>(null);
  const [transferBusy, setTransferBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/bookings/code/${encodeURIComponent(bookingCode)}`);
      const data = await res.json();
      if (res.ok && data.success && data.data) setBooking(data.data);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  }, [bookingCode]);

  React.useEffect(() => {
    if (!bookingCode) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    load();
  }, [bookingCode, load]);

  async function submitTransfer() {
    if (!transfer || transferBusy) return;
    if (!transfer.name.trim() || !transfer.email.trim()) return;
    setTransferBusy(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/bookings/${encodeURIComponent(bookingCode)}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: transfer.id, name: transfer.name.trim(), email: transfer.email.trim() }),
      });
      if (res.ok) {
        setTransfer(null);
        await load(); // refetch so the reissued QR shows
      }
    } catch {
      /* leave the modal open on failure */
    }
    setTransferBusy(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-soft)]">Loading…</div>;
  if (notFound || !booking)
    return <div className="min-h-screen flex items-center justify-center text-[var(--text-soft)]">Booking not found.</div>;

  // One ticket per attendee; fall back to a single order-level ticket (TIX-01) when
  // no attendees were captured.
  const tickets =
    booking.attendees && booking.attendees.length > 0
      ? booking.attendees.map((a) => ({
          id: a.id,
          code: a.ticketCode,
          name: a.name as string | undefined,
          ticketType: a.ticketType,
          checkedInAt: a.checkedInAt,
        }))
      : [{ id: undefined as number | undefined, code: booking.bookingCode, name: undefined as string | undefined, ticketType: booking.items?.[0]?.ticketType?.name, checkedInAt: null }];

  return (
    <div className="min-h-screen bg-[var(--surface-slate-100)] print:bg-[var(--surface)]">
      <div className="max-w-2xl mx-auto p-6 print:p-0">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link
            href={`/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`}
            className="text-sm text-[var(--text-primary)] hover:underline"
          >
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold"
          >
            Print / Save as PDF
          </button>
        </div>

        <div className="space-y-6 print:space-y-0">
          {tickets.map((t, idx) => (
            <div
              key={idx}
              data-testid="printable-ticket"
              className={`bg-[var(--surface)] rounded-xl border p-6 shadow-sm print:shadow-none print:rounded-none ${
                idx < tickets.length - 1 ? "break-after-page" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-extrabold text-[var(--text-slate-900)]">{booking.event?.name || "Event"}</h1>
                  <p className="text-sm text-[var(--text-slate)] mt-1">{fmtDate(booking.event?.startDate)}</p>
                  {booking.event?.venue && <p className="text-sm text-[var(--text-slate)]">{booking.event.venue}</p>}
                  {t.name && <p className="mt-3 font-semibold">{t.name}</p>}
                  {t.ticketType && <p className="text-sm text-[var(--text-soft)]">{t.ticketType}</p>}
                  <p className="mt-3 text-xs font-mono text-[var(--text-soft)] break-all">{booking.bookingCode}</p>
                </div>
                <div className="bg-[var(--surface)] p-2 rounded border shrink-0">
                  <QRCodeSVG value={t.code} size={132} />
                </div>
              </div>
              {/* TIX-06: reassign this ticket to a different person (not after check-in). */}
              {t.id != null && !t.checkedInAt && booking.status === "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => setTransfer({ id: t.id as number, name: t.name || "", email: "" })}
                  className="mt-3 text-sm text-[var(--text-primary)] hover:underline print:hidden"
                >
                  Transfer / edit attendee
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* TIX-06 transfer modal */}
      {transfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 print:hidden">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 shadow-xl">
            <h2 className="text-lg font-bold mb-1">Transfer ticket</h2>
            <p className="text-sm text-[var(--text-soft)] mb-4">
              Reassign this ticket to someone else. The old QR stops working. Tickets can&apos;t be
              transferred after check-in.
            </p>
            <label htmlFor="tf-name" className="block text-sm font-medium text-[var(--text-strong)] mb-1">Name</label>
            <input
              id="tf-name"
              value={transfer.name}
              onChange={(e) => setTransfer((t) => (t ? { ...t, name: e.target.value } : t))}
              className="w-full px-3 py-2 border rounded-md mb-3"
            />
            <label htmlFor="tf-email" className="block text-sm font-medium text-[var(--text-strong)] mb-1">Email</label>
            <input
              id="tf-email"
              type="email"
              value={transfer.email}
              onChange={(e) => setTransfer((t) => (t ? { ...t, email: e.target.value } : t))}
              className="w-full px-3 py-2 border rounded-md mb-4"
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setTransfer(null)} className="px-4 py-2 rounded-md border">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransfer}
                disabled={transferBusy || !transfer.name.trim() || !transfer.email.trim()}
                className="px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] disabled:opacity-50 text-white font-semibold"
              >
                {transferBusy ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
