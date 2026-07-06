// frontend/app/events/[id]/booking/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import TicketSelector from "@/components/TicketSelector";
import BookingSummary from "@/components/BookingSummary";
import AttendeeForm from "@/components/AttendeeForm";
import Link from "next/link";
import Footer from "@/components/Footer";
import { apiFetch, getApiUrl } from "@/lib/auth";
import { showToast } from "@/lib/toast";
import { formatPaise } from "@/lib/format";

type TicketType = {
  id: string;
  name: string;
  price: number;
  description?: string;
  available: number;
};

type EventQuestion = {
  id: number;
  label: string;
  type: string; // "text" | "textarea" | "number" | "email" | ...
  required: boolean;
  options?: string;
  order?: number;
};

interface EventData {
  id: number;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  image: string;
  discount?: number; // percentage 0..100 applied to the subtotal
  fest?: { name: string; college: string };
  questions?: EventQuestion[]; // custom registration questions (C4)
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

  // Answers to the event's custom registration questions, keyed by question id.
  const [answers, setAnswers] = useState<Record<number, string>>({});

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

  // Custom registration questions for this event (empty when none configured).
  const questions: EventQuestion[] = [...(event?.questions || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  function setAnswer(questionId: number, value: string) {
    setAnswers((s) => ({ ...s, [questionId]: value }));
  }

  // Every required custom question must have a non-empty answer before submit.
  const questionsValid = questions.every(
    (q) => !q.required || (answers[q.id] ?? "").trim().length > 0
  );

  function setQuantity(ticketId: string, qty: number) {
    const ticket = tickets.find((t) => t.id === ticketId);
    const maxAvailable = ticket?.available || 0;
    setQuantities((s) => ({ ...s, [ticketId]: Math.max(0, Math.min(qty, maxAvailable)) }));
  }

  const subtotal = tickets.reduce(
    (sum, t) => sum + (quantities[t.id] ?? 0) * t.price,
    0
  );

  // PAY-03 / DISCOUNT: CANONICAL fee/tax/discount math in INTEGER PAISE — must
  // stay byte-for-byte identical to the backend (backend/src/routes/bookings.js)
  // so the total shown here equals the total the backend stores and Razorpay
  // charges. t.price is paise, so subtotal is paise; fees round to whole paise.
  // The discount percentage comes from the EVENT (never the client), and the
  // platform fee + GST are computed on the DISCOUNTED base.
  const discountPct = event?.discount ?? 0;
  const discountAmount = Math.round(subtotal * (discountPct / 100)); // paise
  const discountedBase = subtotal - discountAmount; // paise (integers)
  const platformFee = Math.round(discountedBase * 0.02); // paise
  const tax = Math.round((discountedBase + platformFee) * 0.18); // paise
  const total = discountedBase + platformFee + tax; // paise (exact)

  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);
  const requiredAttendees = totalTickets;
  
  const isValid =
    totalTickets > 0 &&
    attendees.length === requiredAttendees &&
    attendees.every((a) => a.name.trim().length > 0 && a.email.trim().length > 0) &&
    guestInfo.email.trim().length > 0 &&
    questionsValid;

  const handleProceedToPayment = async () => {
    if (!isValid || submitting) return;

    setSubmitting(true);

    try {
      // Build tickets array for API
      const ticketsPayload = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
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

      // Answers to the event's custom questions ({ questionId, value }).
      // Only send answered questions; required ones are guaranteed non-empty
      // by the isValid gate above.
      const answersPayload = questions
        .map((q) => ({ questionId: q.id, value: (answers[q.id] ?? "").trim() }))
        .filter((a) => a.value.length > 0);

      // Create booking. Use apiFetch (not raw fetch) so a signed-in buyer's access
      // token is attached and the booking is linked to their account (userId) —
      // otherwise "My bookings" is permanently empty. redirectOnAuthFailure:false
      // keeps the guest checkout path working (no bounce to /signin).
      const res = await apiFetch(
        "/api/bookings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: parseInt(eventId),
            guestEmail: guestInfo.email,
            guestName: guestInfo.name || attendees[0]?.name,
            guestPhone: guestInfo.phone,
            tickets: ticketsPayload,
            attendees: attendeesPayload,
            answers: answersPayload,
          }),
        },
        { redirectOnAuthFailure: false }
      );

      const data = await res.json();

      if (data.success) {
        // A free / fully-discounted booking is auto-completed on creation
        // (status COMPLETED, no payment step) — skip payment and go straight to
        // the confirmation view.
        if (data.data.status === "COMPLETED") {
          localStorage.removeItem("pendingBooking");
          showToast("Booking confirmed!", "success");
          router.push(`/booking-confirmation?bookingCode=${encodeURIComponent(data.data.bookingCode)}`);
          return;
        }
        // Store booking info and proceed to payment
        localStorage.setItem("pendingBooking", JSON.stringify({
          bookingId: data.data.id,
          bookingCode: data.data.bookingCode,
          total: data.data.total,
          eventName: event?.name,
        }));
        router.push(`/events/${eventId}/payment?bookingCode=${data.data.bookingCode}`);
      } else {
        showToast(data.error?.message || "Failed to create booking", "error");
      }
    } catch (error) {
      console.error("Booking error:", error);
      showToast("Failed to create booking. Please try again.", "error");
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
                <label htmlFor="guest-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  id="guest-name"
                  type="text"
                  value={guestInfo.name}
                  onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label htmlFor="guest-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="guest-email"
                  type="email"
                  value={guestInfo.email}
                  onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="guest-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone (optional)</label>
                <input
                  id="guest-phone"
                  type="tel"
                  value={guestInfo.phone}
                  onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Custom registration questions (only when the host configured any) */}
          {questions.length > 0 && (
            <div className="rounded-lg p-6 bg-white border shadow-sm" data-testid="custom-questions">
              <h2 className="text-lg font-semibold">Additional questions</h2>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                The organiser would like a few more details.
              </p>

              <div className="space-y-4">
                {questions.map((q) => {
                  const value = answers[q.id] ?? "";
                  const inputId = `question-${q.id}`;
                  return (
                    <div key={q.id}>
                      <label
                        htmlFor={inputId}
                        className="block text-sm font-medium text-slate-700 mb-1"
                      >
                        {q.label}
                        {q.required && <span className="text-red-500"> *</span>}
                      </label>
                      {q.type === "textarea" ? (
                        <textarea
                          id={inputId}
                          value={value}
                          required={q.required}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      ) : (
                        <input
                          id={inputId}
                          type={
                            q.type === "number"
                              ? "number"
                              : q.type === "email"
                              ? "email"
                              : "text"
                          }
                          value={value}
                          required={q.required}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
          {discountPct > 0 ? (
            // Itemized summary with the discount applied. The discounted total
            // here matches exactly what the backend stores/charges.
            <div className="rounded-lg p-5 border bg-white shadow-sm" data-testid="booking-summary-discount">
              <h4 className="font-semibold mb-3">Summary</h4>

              <div className="space-y-2">
                {tickets
                  .filter((t) => (quantities[t.id] ?? 0) > 0)
                  .map((t) => (
                    <div className="flex items-start justify-between text-sm" key={t.id}>
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-slate-500">
                          Qty {quantities[t.id] ?? 0} × {formatPaise(t.price)}
                        </div>
                      </div>
                      <div className="font-medium">{formatPaise((quantities[t.id] ?? 0) * t.price)}</div>
                    </div>
                  ))}

                <hr className="my-3" />
                <div className="flex justify-between text-sm">
                  <div className="text-slate-600">Subtotal</div>
                  <div>{formatPaise(subtotal)}</div>
                </div>
                <div className="flex justify-between text-sm text-green-700">
                  <div>Discount ({discountPct}%)</div>
                  <div>-{formatPaise(discountAmount)}</div>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="text-slate-600">Platform fee</div>
                  <div>{formatPaise(platformFee)}</div>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="text-slate-600">Tax</div>
                  <div>{formatPaise(tax)}</div>
                </div>

                <div className="flex justify-between items-center mt-4">
                  <div className="text-sm font-medium">Total</div>
                  <div className="text-xl font-bold">{formatPaise(total)}</div>
                </div>
              </div>
            </div>
          ) : (
            <BookingSummary
              subtotal={subtotal}
              platformFee={platformFee}
              tax={tax}
              total={total}
              items={tickets.map((t) => ({ ...t, qty: quantities[t.id] ?? 0 }))}
            />
          )}

          <div className="rounded-lg p-5 border bg-white shadow-sm">
            <h4 className="font-semibold mb-3">Payment</h4>

            <div className="space-y-3">
              <div className="text-sm text-slate-600">Total to pay</div>
              <div className="text-2xl font-bold text-slate-900">{formatPaise(total)}</div>

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
                  {guestInfo.email.trim() &&
                    attendees.every((a) => a.name.trim() && a.email.trim()) &&
                    !questionsValid &&
                    "⚠ Please answer all required questions"}
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
