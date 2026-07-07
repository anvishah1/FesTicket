"use client";

import { useState, useEffect } from "react";
import { showToast } from "@/lib/toast";
import type { RefundPolicy } from "@/lib/refundPolicy";

interface TicketsProps {
  onNext: (data: TicketsData) => void;
  /** Fires on every edit so the wizard persists in-progress input (H11). */
  onChange?: (data: TicketsData) => void;
  initialData?: TicketsData;
}

export type TicketType = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  description: string;
};

export interface TicketsData {
  isPaid: boolean;
  tickets: TicketType[];
  // PAY-06: buyer refund policy for this event (optional so older callers/tests
  // that build TicketsData without them still typecheck; the component defaults
  // to NO_REFUND).
  refundPolicy?: RefundPolicy;
  refundCutoffHours?: string; // kept as a string for the input; parsed at submit
  // TIX-10: optional per-order ticket cap. Kept as a string for the input; blank
  // means "no cap". Parsed at submit by the create page.
  maxTicketsPerOrder?: string;
}

export default function Tickets({ onNext, onChange, initialData }: TicketsProps) {
  const [isPaid, setIsPaid] = useState(initialData?.isPaid ?? true);
  const [tickets, setTickets] = useState<TicketType[]>(
    initialData?.tickets || [{ id: 1, name: "General Admission", price: 0, quantity: 100, description: "" }]
  );
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicy>(initialData?.refundPolicy ?? "NO_REFUND");
  const [refundCutoffHours, setRefundCutoffHours] = useState<string>(initialData?.refundCutoffHours ?? "48");
  const [maxTicketsPerOrder, setMaxTicketsPerOrder] = useState<string>(initialData?.maxTicketsPerOrder ?? "");

  // Report every edit up so switching steps via the Sidebar never loses input.
  useEffect(() => {
    onChange?.({ isPaid, tickets, refundPolicy, refundCutoffHours, maxTicketsPerOrder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, tickets, refundPolicy, refundCutoffHours, maxTicketsPerOrder]);

  function addTicket() {
    setTickets([
      ...tickets,
      { id: Date.now(), name: "", price: 0, quantity: 100, description: "" },
    ]);
  }

  function updateTicket(id: number, field: keyof TicketType, value: string | number) {
    setTickets(
      tickets.map((t) =>
        t.id === id ? { ...t, [field]: value } : t
      )
    );
  }

  function removeTicket(id: number) {
    setTickets(tickets.filter((t) => t.id !== id));
  }

  const handleSubmit = () => {
    const validTickets = tickets.filter((t) => t.name.trim());
    if (validTickets.length === 0) {
      showToast("Please add at least one ticket type", "error");
      return;
    }
    for (const t of validTickets) {
      if (isPaid && (!Number.isFinite(t.price) || t.price < 0)) {
        showToast(`Ticket "${t.name}" has an invalid price. Price cannot be negative.`, "error");
        return;
      }
      if (!Number.isFinite(t.quantity) || t.quantity <= 0) {
        showToast(`Ticket "${t.name}" needs a quantity of at least 1.`, "error");
        return;
      }
    }
    // TIX-10: a blank cap means "no cap"; a provided cap must be a positive integer.
    const capTrimmed = maxTicketsPerOrder.trim();
    if (capTrimmed && (!/^\d+$/.test(capTrimmed) || parseInt(capTrimmed) < 1)) {
      showToast("Max tickets per order must be a whole number of at least 1 (or blank for no limit).", "error");
      return;
    }
    onNext({
      isPaid,
      tickets: validTickets.map((t) => ({
        ...t,
        price: isPaid ? t.price : 0,
      })),
      refundPolicy,
      refundCutoffHours,
      maxTicketsPerOrder: capTrimmed,
    });
  };

  return (
    <div className="flex-1 rounded-xl border border-[#C5BAC4] bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[#29104A]">
        Tickets
      </h2>

      <div className="space-y-6">
        {/* Ticket Type */}
        <div>
          <span id="ticket-type-label" className="mb-2 block text-sm font-medium text-[#29104A]">
            Ticket Type
          </span>

          <div className="flex gap-4" role="group" aria-labelledby="ticket-type-label">
            <ToggleButton
              label="Paid"
              active={isPaid}
              onClick={() => setIsPaid(true)}
            />
            <ToggleButton
              label="Free"
              active={!isPaid}
              onClick={() => setIsPaid(false)}
            />
          </div>
        </div>

        {/* Ticket List */}
        <div className="space-y-4">
          {tickets.map((ticket, index) => (
            <div
              key={ticket.id}
              className="rounded-lg border border-[#C5BAC4] bg-[#C5BAC4]/10 p-4 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-[#29104A]">
                  Ticket {index + 1}
                </h3>

                {tickets.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ticket ${index + 1}`}
                    onClick={() => removeTicket(ticket.id)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor={`ticket-name-${ticket.id}`} className="sr-only">
                    Ticket {index + 1} name
                  </label>
                  <input
                    id={`ticket-name-${ticket.id}`}
                    placeholder="Ticket Name"
                    value={ticket.name}
                    onChange={(e) =>
                      updateTicket(ticket.id, "name", e.target.value)
                    }
                    className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
                  />
                </div>

                {isPaid ? (
                  <div>
                    <label htmlFor={`ticket-price-${ticket.id}`} className="sr-only">
                      Ticket {index + 1} price in rupees
                    </label>
                    <input
                      id={`ticket-price-${ticket.id}`}
                      type="number"
                      min={0}
                      placeholder="Price (₹)"
                      value={ticket.price || ""}
                      onChange={(e) =>
                        updateTicket(
                          ticket.id,
                          "price",
                          Math.max(0, parseInt(e.target.value) || 0)
                        )
                      }
                      className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-[#C5BAC4] bg-[#C5BAC4]/30 text-sm text-[#6B597F]">
                    Free
                  </div>
                )}

                <div>
                  <label htmlFor={`ticket-quantity-${ticket.id}`} className="sr-only">
                    Ticket {index + 1} quantity
                  </label>
                  <input
                    id={`ticket-quantity-${ticket.id}`}
                    type="number"
                    min={1}
                    placeholder="Quantity"
                    value={ticket.quantity || ""}
                    onChange={(e) =>
                      updateTicket(
                        ticket.id,
                        "quantity",
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
                  />
                </div>
              </div>

              <label htmlFor={`ticket-description-${ticket.id}`} className="sr-only">
                Ticket {index + 1} description
              </label>
              <textarea
                id={`ticket-description-${ticket.id}`}
                rows={2}
                placeholder="Description (optional)"
                value={ticket.description}
                onChange={(e) =>
                  updateTicket(ticket.id, "description", e.target.value)
                }
                className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 text-sm focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
              />
            </div>
          ))}
        </div>

        {/* Add Ticket */}
        <button
          type="button"
          onClick={addTicket}
          className="w-full rounded-lg border-2 border-dashed border-[#C5BAC4] py-4 text-[#6B597F] hover:border-[#522C5D] hover:text-[#522C5D] transition"
        >
          + Add Another Ticket Type
        </button>

        {/* PAY-06: Refund policy */}
        <div className="rounded-lg border border-[#C5BAC4] p-4 space-y-3">
          <label htmlFor="refund-policy" className="block text-sm font-medium text-[#29104A]">
            Refund policy
          </label>
          <select
            id="refund-policy"
            value={refundPolicy}
            onChange={(e) => setRefundPolicy(e.target.value as RefundPolicy)}
            className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 text-sm text-[#29104A] focus:border-[#522C5D] focus:outline-none"
          >
            <option value="NO_REFUND">No refunds</option>
            <option value="FULL_ANYTIME">Full refund any time before the event</option>
            <option value="FULL_UNTIL_CUTOFF">Full refund up to a cutoff before the event</option>
          </select>
          {refundPolicy === "FULL_UNTIL_CUTOFF" && (
            <div>
              <label htmlFor="refund-cutoff" className="mb-1 block text-xs text-[#6B597F]">
                Refund cutoff (hours before the event start)
              </label>
              <input
                id="refund-cutoff"
                type="number"
                min={0}
                value={refundCutoffHours}
                onChange={(e) => setRefundCutoffHours(e.target.value)}
                placeholder="48"
                className="w-40 rounded-lg border border-[#C5BAC4] px-3 py-2 text-sm text-[#29104A] focus:border-[#522C5D] focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* TIX-10: per-order ticket cap */}
        <div className="rounded-lg border border-[#C5BAC4] p-4 space-y-2">
          <label htmlFor="max-per-order" className="block text-sm font-medium text-[#29104A]">
            Max tickets per order
          </label>
          <input
            id="max-per-order"
            type="number"
            min={1}
            value={maxTicketsPerOrder}
            onChange={(e) => setMaxTicketsPerOrder(e.target.value)}
            placeholder="No limit"
            className="w-40 rounded-lg border border-[#C5BAC4] px-3 py-2 text-sm text-[#29104A] focus:border-[#522C5D] focus:outline-none"
          />
          <p className="text-xs text-[#6B597F]">Leave blank to allow any number of tickets in a single order.</p>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSubmit}
          className="mt-6 w-full rounded-lg bg-[#522C5D] py-3 text-white font-medium hover:bg-[#29104A] transition"
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition
        ${
          active
            ? "border-[#522C5D] bg-[#522C5D]/10 text-[#522C5D]"
            : "border-[#C5BAC4] bg-white text-[#6B597F] hover:bg-[#C5BAC4]/20"
        }`}
    >
      {label}
    </button>
  );
}
