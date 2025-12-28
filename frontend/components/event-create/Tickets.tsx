"use client";

import { useState } from "react";

interface TicketsProps {
  onNext: () => void;
}

type Ticket = {
  id: number;
  name: string;
  price: string;
  quantity: string;
};

export default function Tickets({ onNext }: TicketsProps) {
  const [isPaid, setIsPaid] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([
    { id: 1, name: "General Admission", price: "", quantity: "" },
  ]);

  function addTicket() {
    setTickets([
      ...tickets,
      { id: Date.now(), name: "", price: "", quantity: "" },
    ]);
  }

  function updateTicket(id: number, field: keyof Ticket, value: string) {
    setTickets(
      tickets.map((t) =>
        t.id === id ? { ...t, [field]: value } : t
      )
    );
  }

  function removeTicket(id: number) {
    setTickets(tickets.filter((t) => t.id !== id));
  }

  return (
    <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        Tickets
      </h2>

      <div className="space-y-6">
        {/* Ticket Type */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Ticket Type
          </label>

          <div className="flex gap-4">
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
              className="rounded-lg border bg-gray-50 p-4 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-gray-800">
                  Ticket {index + 1}
                </h3>

                {tickets.length > 1 && (
                  <button
                    onClick={() => removeTicket(ticket.id)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <input
                  placeholder="Ticket Name"
                  value={ticket.name}
                  onChange={(e) =>
                    updateTicket(ticket.id, "name", e.target.value)
                  }
                  className="rounded-lg border px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />

                {isPaid ? (
                  <input
                    placeholder="Price (₹)"
                    value={ticket.price}
                    onChange={(e) =>
                      updateTicket(ticket.id, "price", e.target.value)
                    }
                    className="rounded-lg border px-3 py-2 focus:border-emerald-600 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-lg border bg-gray-100 text-sm text-gray-600">
                    Free
                  </div>
                )}

                <input
                  placeholder="Quantity"
                  value={ticket.quantity}
                  onChange={(e) =>
                    updateTicket(ticket.id, "quantity", e.target.value)
                  }
                  className="rounded-lg border px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Add Ticket */}
        <button
          onClick={addTicket}
          className="w-full rounded-lg border-2 border-dashed py-4 text-gray-600 hover:border-gray-400 transition"
        >
          + Add Another Ticket
        </button>

        {/* Save */}
        <button
          onClick={onNext}
          className="mt-6 w-full rounded-lg bg-emerald-700 py-3 text-white font-medium hover:bg-emerald-800 transition"
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
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition
        ${
          active
            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
    >
      {label}
    </button>
  );
}
