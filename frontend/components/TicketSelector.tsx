// frontend/components/TicketSelector.tsx
"use client";

import { useState } from "react";
import { formatPaise } from "@/lib/format";

export default function TicketSelector({
  ticket,
  value,
  onChange,
  onJoinWaitlist,
  max,
}: {
  ticket: { id: string; name: string; price: number; description?: string; available: number };
  value: number;
  onChange: (n: number) => void;
  // PAY-08: when provided and the type is sold out, buyers can join the waitlist.
  onJoinWaitlist?: (data: { ticketTypeId: string; email: string; name: string }) => Promise<{ ok: boolean; message?: string }>;
  // FE-15/TIX-10: effective upper bound for THIS type (defaults to availability).
  // The booking page passes the per-order cap remaining so the + button disables
  // and the input clamps at the cap, not just at stock.
  max?: number;
}) {
  const soldOut = ticket.available <= 0;
  // Never exceed either stock or the caller-supplied cap.
  const ceiling = Math.max(0, Math.min(ticket.available, max ?? ticket.available));

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
          <div className="text-xs text-[var(--text-soft)]">
            {soldOut ? "Sold out" : `(${ticket.available} available)`}
          </div>
        </div>
        <div className="text-sm text-[var(--text-soft)] mt-1">{ticket.description}</div>
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
              className="text-sm px-3 py-1.5 rounded-md bg-[var(--fill-ink)] text-white font-medium disabled:opacity-50"
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
            className="shrink-0 text-sm px-3 py-2 rounded-md border border-[var(--border-ink)] text-[var(--text-primary)] font-medium hover:bg-[var(--surface-page)]"
            data-testid="join-waitlist"
          >
            Join waitlist
          </button>
        ) : null
      ) : (
        <div className="flex items-center gap-2">
          {/* FE-15: 44px min tap targets (was 36px); disabled at the bounds. */}
          <button
            type="button"
            aria-label={`Decrease ${ticket.name}`}
            onClick={() => onChange(Math.max(0, value - 1))}
            disabled={value <= 0}
            className="min-w-11 min-h-11 rounded-md bg-[var(--surface-slate-100)] flex items-center justify-center text-[var(--text-strong)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            −
          </button>

          <input
            aria-label={`${ticket.name} quantity`}
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={ceiling}
            value={value}
            onChange={(e) => {
              // FE-15: guard NaN (empty / non-numeric) and clamp to [0, ceiling].
              const n = parseInt(e.target.value, 10);
              onChange(Number.isNaN(n) ? 0 : Math.min(ceiling, Math.max(0, n)));
            }}
            className="w-16 text-center border rounded-md px-2 py-1"
          />

          <button
            type="button"
            aria-label={`Increase ${ticket.name}`}
            onClick={() => onChange(Math.min(ceiling, value + 1))}
            disabled={value >= ceiling}
            className="min-w-11 min-h-11 rounded-md bg-[var(--fill-plum)] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
      )}

      {/* FE-15: announce the new quantity + line total to assistive tech. */}
      {!soldOut && (
        <span className="sr-only" role="status" aria-live="polite" data-testid="qty-announce">
          {value} {value === 1 ? "ticket" : "tickets"}, {formatPaise(value * ticket.price)}
        </span>
      )}
    </div>
  );
}
