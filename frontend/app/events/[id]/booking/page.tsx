// frontend/app/events/[id]/booking/page.tsx

"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import TicketSelector from "@/components/TicketSelector";
import BookingSummary from "@/components/BookingSummary";
import AttendeeForm from "@/components/AttendeeForm";
import Link from "next/link";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

type TicketType = {
  id: string;
  name: string;
  price: number;
  description?: string;
  available: number;
};

interface EventData {
  id: number;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  image: string;
  fest?: { name: string; college: string };
  ticketTypes: Array<{
    id: number;
    name: string;
    price: number;
    quantity: number;
    sold: number;
    description?: string;
  }>;
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // local state: selected ticket quantities
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // attendee info
  const [attendees, setAttendees] = useState<{ name: string; email: string; ticketTypeId?: string }[]>([]);

  // Guest info
  const [guestInfo, setGuestInfo] = useState({ name: "", email: "", phone: "" });

  // Fetch event data
  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/events/${eventId}`);
        const data = await res.json();
        if (data.success && data.data) {
          setEvent(data.data);
          // Initialize quantities for each ticket type
          const initialQty: Record<string, number> = {};
          data.data.ticketTypes.forEach((t: any) => {
            initialQty[t.id.toString()] = 0;
          });
          setQuantities(initialQty);
        }
      } catch (error) {
        console.error("Failed to fetch event:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  // Update attendees when quantities change
  useEffect(() => {
    const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);
    const required = totalTickets;

    setAttendees((prev) => {
      if (prev.length > required) {
        return prev.slice(0, required);
      }
      if (prev.length < required) {
        const need = required - prev.length;
        const blanks = Array.from({ length: need }, () => ({ name: "", email: "" }));
        return [...prev, ...blanks];
      }
      return prev;
    });
  }, [quantities]);

  // Convert event ticket types to the format expected by components
  const tickets: TicketType[] = event?.ticketTypes.map((t) => ({
    id: t.id.toString(),
    name: t.name,
    price: t.price,
    description: t.description,
    available: t.quantity - t.sold,
  })) || [];

  function setQuantity(ticketId: string, qty: number) {
    const ticket = tickets.find((t) => t.id === ticketId);
    const maxAvailable = ticket?.available || 0;
    setQuantities((s) => ({ ...s, [ticketId]: Math.max(0, Math.min(qty, maxAvailable)) }));
  }

  const subtotal = tickets.reduce(
    (sum, t) => sum + (quantities[t.id] ?? 0) * t.price,
    0
  );

  const platformFee = Math.round(subtotal * 0.02);
  const tax = Math.round((subtotal + platformFee) * 0.18);
  const total = subtotal + platformFee + tax;

  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);
  const requiredAttendees = totalTickets;
  
  const isValid =
    totalTickets > 0 &&
    attendees.length === requiredAttendees &&
    attendees.every((a) => a.name.trim().length > 0 && a.email.trim().length > 0) &&
    guestInfo.email.trim().length > 0;

  const handleProceedToPayment = async () => {
    if (!isValid || submitting) return;

    setSubmitting(true);

    try {
      // Build tickets array for API
      const ticketsPayload = Object.entries(quantities)
        .filter(([_, qty]) => qty > 0)
        .map(([ticketTypeId, quantity]) => ({
          ticketTypeId: parseInt(ticketTypeId),
          quantity,
        }));

      // Build attendees array with ticket type mapping
      const attendeesPayload: { ticketTypeId: number; name: string; email: string }[] = [];
      let attendeeIndex = 0;
      for (const [ticketTypeId, qty] of Object.entries(quantities)) {
        for (let i = 0; i < qty; i++) {
          if (attendees[attendeeIndex]) {
            attendeesPayload.push({
              ticketTypeId: parseInt(ticketTypeId),
              name: attendees[attendeeIndex].name,
              email: attendees[attendeeIndex].email,
            });
            attendeeIndex++;
          }
        }
      }

      // Create booking
      const res = await fetch(`${getApiUrl()}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: parseInt(eventId),
          guestEmail: guestInfo.email,
          guestName: guestInfo.name || attendees[0]?.name,
          guestPhone: guestInfo.phone,
          tickets: ticketsPayload,
          attendees: attendeesPayload,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Store booking info and proceed to payment
        localStorage.setItem("pendingBooking", JSON.stringify({
          bookingId: data.data.id,
          bookingCode: data.data.bookingCode,
          total: data.data.total,
          eventName: event?.name,
        }));
        router.push(`/events/${eventId}/payment?bookingId=${data.data.id}`);
      } else {
        alert(data.error?.message || "Failed to create booking");
      }
    } catch (error) {
      console.error("Booking error:", error);
      alert("Failed to create booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-10 text-center">
          <h1 className="text-2xl font-bold">Event not found</h1>
          <Link href="/fests" className="text-primary-600 mt-4 inline-block">
            ← Back to events
          </Link>
        </main>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "TBA";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: main booking flow */}
        <section className="lg:col-span-2 space-y-8">
          <div className="rounded-lg p-6 bg-white border shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold">{event.name}</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Booking · {formatDate(event.startDate)} · {event.venue || "Venue TBA"}
                </p>
                {event.fest && (
                  <p className="text-xs text-slate-400 mt-1">
                    Part of {event.fest.name} at {event.fest.college}
                  </p>
                )}
              </div>
              <div className="text-sm text-slate-600">Booking step 1 of 2</div>
            </div>

            <hr className="my-6" />

            <h2 className="text-lg font-semibold">Choose tickets</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">Select the number of tickets you want to book.</p>

            {tickets.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No tickets available for this event yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => (
                  <TicketSelector
                    key={t.id}
                    ticket={t}
                    value={quantities[t.id] ?? 0}
                    onChange={(v) => setQuantity(t.id, v)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Your Contact Info */}
          <div className="rounded-lg p-6 bg-white border shadow-sm">
            <h2 className="text-lg font-semibold">Your Contact Information</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">We'll send your tickets to this email</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={guestInfo.name}
                  onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={guestInfo.email}
                  onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={guestInfo.phone}
                  onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Attendees form */}
          {totalTickets > 0 && (
            <div className="rounded-lg p-6 bg-white border shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">Attendee details</h2>
                <div className="text-sm text-slate-500">Add one attendee per ticket</div>
              </div>

              <div className="mt-4">
                <AttendeeForm
                  requiredCount={requiredAttendees}
                  attendees={attendees}
                  onChange={setAttendees}
                />
                <p className="text-xs text-slate-500 mt-2">
                  We'll send tickets and updates to the listed attendee emails.
                </p>
              </div>
            </div>
          )}

          {/* Notes / policies */}
          <div className="rounded-lg p-6 bg-white border shadow-sm">
            <h3 className="font-semibold">Important</h3>
            <ul className="list-disc pl-5 mt-3 text-sm text-slate-600 space-y-2">
              <li>Tickets are non-transferable after registration.</li>
              <li>Refund policy: full refund up to 7 days before the event.</li>
              <li>Attendees must carry a valid ID for check-in.</li>
            </ul>
          </div>
        </section>

        {/* Right: summary & payment */}
        <aside className="space-y-6">
          <BookingSummary
            subtotal={subtotal}
            platformFee={platformFee}
            tax={tax}
            total={total}
            items={tickets.map((t) => ({ ...t, qty: quantities[t.id] ?? 0 }))}
          />

          <div className="rounded-lg p-5 border bg-white shadow-sm">
            <h4 className="font-semibold mb-3">Payment</h4>

            <div className="space-y-3">
              <div className="text-sm text-slate-600">Total to pay</div>
              <div className="text-2xl font-bold text-slate-900">₹{total.toLocaleString()}</div>

              {/* Validation message */}
              {!isValid && totalTickets > 0 && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {!guestInfo.email.trim() && "⚠ Please enter your email address"}
                  {guestInfo.email.trim() && attendees.some((a) => !a.name.trim()) &&
                    "⚠ Please fill in the NAME for all attendees"}
                  {guestInfo.email.trim() &&
                    attendees.every((a) => a.name.trim()) &&
                    attendees.some((a) => !a.email.trim()) &&
                    "⚠ Please fill in the EMAIL for all attendees"}
                </div>
              )}

              {totalTickets === 0 && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                  ⚠ Please select at least 1 ticket
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={handleProceedToPayment}
                  disabled={!isValid || submitting}
                  className={`w-full inline-flex items-center justify-center gap-3 px-4 py-2 rounded-md text-white font-semibold ${
                    !isValid || submitting
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-primary-600 hover:bg-primary-700"
                  }`}
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    "Proceed to Payment →"
                  )}
                </button>
              </div>

              <div className="text-xs text-slate-500 mt-4">
                You'll be redirected to our secure payment page.
              </div>
            </div>
          </div>

          <div className="rounded-lg p-5 border bg-white shadow-sm">
            <h4 className="font-semibold mb-3">Need help?</h4>
            <p className="text-sm text-slate-600">
              Contact support at{" "}
              <a className="text-primary-600 underline" href="mailto:support@tiqr.events">
                support@tiqr.events
              </a>
            </p>
            <Link href="/fests" className="block mt-3 text-sm text-slate-500 hover:underline">
              Back to events
            </Link>
          </div>
        </aside>
      </main>
      <Footer />
    </div>
  );
}
