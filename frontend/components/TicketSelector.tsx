// frontend/components/TicketSelector.tsx

import { formatCurrency } from "@/lib/format";

export default function TicketSelector({
  ticket,
  value,
  onChange,
}: {
  ticket: { id: string; name: string; price: number; description?: string; available: number };
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border rounded-lg p-3">
      <div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">{ticket.name}</div>
          <div className="text-xs text-slate-500">({ticket.available} available)</div>
        </div>
        <div className="text-sm text-slate-500 mt-1">{ticket.description}</div>
        <div className="text-sm font-medium mt-2">{formatCurrency(ticket.price)}</div>
      </div>

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
    </div>
  );
}
