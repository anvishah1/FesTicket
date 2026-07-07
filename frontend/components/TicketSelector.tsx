// frontend/components/TicketSelector.tsx
"use client";

import { useState } from "react";
import { formatPaise } from "@/lib/format";

export default function TicketSelector({
  ticket,
  value,
  onChange,
  onJoinWaitlist,
}: {
  ticket: { id: string; name: string; price: number; description?: string; available: number };
  value: number;
  onChange: (n: number) => void;
  // PAY-08: when provided and the type is sold out, buyers can join the waitlist.
  onJoinWaitlist?: (data: { ticketTypeId: string; email: string; name: string }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const soldOut = ticket.available <= 0;

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);

  const submitWaitlist = async () => {
    if (!email.trim() || busy || !onJoinWaitlist) return;
    setBusy(true);
    try {
      const res = await onJoinWaitlist({ ticketTypeId: ticket.id, email: email.trim(), name: name.trim() });
      if (res.ok) setJoined(res.message || "You're on the waitlist — we'll email you if a seat opens.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 border rounded-lg p-3">
      <div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">{ticket.name}</div>
          <div className="text-xs text-slate-500">
            {soldOut ? "Sold out" : `(${ticket.available} available)`}
          </div>
        </div>
        <div className="text-sm text-slate-500 mt-1">{ticket.description}</div>
        <div className="text-sm font-medium mt-2">{formatPaise(ticket.price)}</div>

        {/* PAY-08 sold-out waitlist capture */}
        {soldOut && onJoinWaitlist && (joined ? (
          <p className="mt-2 text-sm text-green-700" data-testid="waitlist-joined">{joined}</p>
        ) : showForm ? (
          <div className="mt-2 space-y-2" data-testid="waitlist-form">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              aria-label="Waitlist name"
              className="border rounded-md px-2 py-1 text-sm w-full"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              aria-label="Waitlist email"
              className="border rounded-md px-2 py-1 text-sm w-full"
            />
            <button
              type="button"
              onClick={submitWaitlist}
              disabled={busy || !email.trim()}
              className="text-sm px-3 py-1.5 rounded-md bg-primary-600 text-white font-medium disabled:opacity-50"
            >
              {busy ? "Joining…" : "Join waitlist"}
            </button>
          </div>
        ) : null)}
      </div>

      {soldOut ? (
        onJoinWaitlist && !joined && !showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="shrink-0 text-sm px-3 py-2 rounded-md border border-primary-600 text-primary-700 font-medium hover:bg-primary-50"
            data-testid="join-waitlist"
          >
            Join waitlist
          </button>
        ) : null
      ) : (
        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${ticket.name}`}
            onClick={() => onChange(Math.max(0, value - 1))}
            className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-700"
          >
            −
          </button>

          <input
            aria-label={`${ticket.name} quantity`}
            type="number"
            min={0}
            max={ticket.available}
            value={value}
            onChange={(e) => onChange(Number(e.target.value || 0))}
            className="w-16 text-center border rounded-md px-2 py-1"
          />

          <button
            aria-label={`Increase ${ticket.name}`}
            onClick={() => onChange(Math.min(ticket.available, value + 1))}
            className="w-9 h-9 rounded-md bg-primary-500 text-white flex items-center justify-center"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
