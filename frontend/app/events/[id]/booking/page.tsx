// frontend/app/events/[id]/booking/page.tsx

"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import TicketSelector from "@/components/TicketSelector";
import BookingSummary from "@/components/BookingSummary";
import AttendeeForm from "@/components/AttendeeForm";
import Link from "next/link";
import Footer from "@/components/Footer";

type TicketType = {
  id: string;
  name: string;
  price: number; // in rupees or cents; adapt as needed
  description?: string;
  available: number;
};

const demoTickets: TicketType[] = [
  { id: "early", name: "Early Bird", price: 0, description: "Limited free slots", available: 50 },
  { id: "general", name: "General", price: 200, description: "Standard entry", available: 120 },
  { id: "workshop", name: "Workshop", price: 500, description: "Workshop access + event", available: 30 },
];

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id;

  // local state: selected ticket quantities
  const [quantities, setQuantities] = React.useState<Record<string, number>>({
    early: 0,
    general: 0,
    workshop: 0,
  });

  // attendee info (simple)
  const [attendees, setAttendees] = React.useState<
    { name: string; email: string }[]
  >([]);

  React.useEffect(() => {
  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);
  const required = totalTickets; // 1 attendee per ticket

  setAttendees((prev) => {
    // If we have too many attendee entries, trim them
    if (prev.length > required) {
      return prev.slice(0, required);
    }

    // If we have fewer, append empty entries (so user sees blank fields)
    if (prev.length < required) {
      const need = required - prev.length;
      const blanks = Array.from({ length: need }, () => ({ name: "", email: "" }));
      return [...prev, ...blanks];
    }

    // exact match -> unchanged
    return prev;
    });
  }, [quantities]);

  // helper updates
  function setQuantity(ticketId: string, qty: number) {
    setQuantities((s) => ({ ...s, [ticketId]: Math.max(0, Math.min(qty, 999)) }));
  }

  const subtotal = demoTickets.reduce(
    (sum, t) => sum + (quantities[t.id] ?? 0) * t.price,
    0
  );

  // Mock fees: 2% platform fee + 18% GST on subtotal (example)
  const platformFee = Math.round(subtotal * 0.02);
  const tax = Math.round((subtotal + platformFee) * 0.18);
  const total = subtotal + platformFee + tax;

  // Basic validation: make sure tickets chosen and attendee count matches non-free tickets
  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);
  const requiredAttendees = totalTickets; // require 1 attendee per ticket
  const isValid =
  totalTickets > 0 &&
  attendees.length === requiredAttendees &&
  attendees.every(a => a.name.trim().length > 0 && a.email.trim().length > 0);


  return (
    <div className="min-h-screen">
      <Header />

      <main className="container py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: main booking flow */}
        <section className="lg:col-span-2 space-y-8">
          <div className="rounded-lg p-6 bg-white border shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold">Power & Energy Research Conclave</h1>
                <p className="text-sm text-slate-500 mt-1">Booking · February 3rd–7th, 2026 · NIT Calicut</p>
              </div>
              <div className="text-sm text-slate-600">Booking step 1 of 3</div>
            </div>

            <hr className="my-6" />

            <h2 className="text-lg font-semibold">Choose tickets</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">Select the number of tickets you want to book.</p>

            <div className="space-y-3">
              {demoTickets.map((t) => (
                <TicketSelector
                  key={t.id}
                  ticket={t}
                  value={quantities[t.id] ?? 0}
                  onChange={(v) => setQuantity(t.id, v)}
                />
              ))}
            </div>
          </div>

          {/* Attendees form */}
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
                We’ll send tickets and updates to the listed attendee emails.
              </p>
            </div>
          </div>

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
            items={demoTickets.map((t) => ({ ...t, qty: quantities[t.id] ?? 0 }))}
          />

          <div className="rounded-lg p-5 border bg-white shadow-sm">
            <h4 className="font-semibold mb-3">Payment</h4>

            <div className="space-y-3">
              <div className="text-sm text-slate-600">Total to pay</div>
              <div className="text-2xl font-bold text-slate-900">₹{total}</div>

              {/* Validation message */}
              {!isValid && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {totalTickets === 0 && "⚠ Please select at least 1 ticket"}
                  {totalTickets > 0 && attendees.some(a => !a.name.trim()) && 
                    "⚠ Please fill in the NAME for all attendees"}
                  {totalTickets > 0 && attendees.every(a => a.name.trim()) && attendees.some(a => !a.email.trim()) && 
                    "⚠ Please fill in the EMAIL for all attendees"}
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={() => router.push(`/events/${eventId}/payment`)}
                  disabled={!isValid}
                  className={`w-full inline-flex items-center justify-center gap-3 px-4 py-2 rounded-md text-white font-semibold ${
                    !isValid ? "bg-slate-300 cursor-not-allowed" : "bg-primary-600 hover:bg-primary-700"
                  }`}
                >
                  Proceed to Payment →
                </button>
              </div>

              <div className="text-xs text-slate-500 mt-4">
                You'll be redirected to our secure payment page.
              </div>
            </div>
          </div>

          <div className="rounded-lg p-5 border bg-white shadow-sm">
            <h4 className="font-semibold mb-3">Need help?</h4>
            <p className="text-sm text-slate-600">Contact support at <a className="text-primary-600 underline" href="mailto:support@tiqrdupe.local">support@tiqrdupe.local</a></p>
            <Link href="/fests" className="block mt-3 text-sm text-slate-500 hover:underline">Back to events</Link>
          </div>
        </aside>
      </main>
      <Footer />
    </div>
  );
}
