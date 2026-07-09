// frontend/components/admin/BookingFunnel.tsx
// ANL-03: per-status booking funnel for a fest. Shows Started -> Completed ->
// Cancelled (+ Refunded) with counts and paise sums, the conversion rate, and an
// amber "held in pending" callout for money reserved by unpaid bookings (inventory
// is decremented at booking creation).
"use client";

import { formatPaise } from "@/lib/format";

export interface FunnelData {
  started: number;
  completed: number;
  cancelled: number;
  refunded: number;
  conversionRate: number; // 0..1
  valueHeldPending: number; // paise
  valueCompleted: number;
  valueCancelled: number;
  valueRefunded: number;
}

const pending = (d: FunnelData) => d.started - d.completed - d.cancelled - d.refunded;

export default function BookingFunnel({ data }: { data: FunnelData }) {
  const total = Math.max(1, data.started);
  const pct = (n: number) => Math.round((n / total) * 100);

  const stages = [
    { key: "started", label: "Started", count: data.started, value: null, color: "var(--fill-mauve)" },
    { key: "completed", label: "Completed", count: data.completed, value: data.valueCompleted, color: "var(--fill-plum)" },
    { key: "cancelled", label: "Cancelled", count: data.cancelled, value: data.valueCancelled, color: "#B42318" },
  ] as const;

  const heldPending = Math.max(0, pending(data));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Booking funnel</h2>
        <span className="text-xs text-[var(--text-muted)]">
          {Math.round(data.conversionRate * 100)}% conversion
        </span>
      </div>

      <div className="space-y-2.5">
        {stages.map((s) => (
          <div key={s.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[var(--text-secondary)] font-medium">{s.label}</span>
              <span className="text-[var(--text-muted)]">
                {s.count.toLocaleString()}
                {s.value != null ? ` · ${formatPaise(s.value)}` : ""}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--surface-slate-100)] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(s.count > 0 ? 4 : 0, pct(s.count))}%`, backgroundColor: s.color }}
              />
            </div>
          </div>
        ))}
        {data.refunded > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            + {data.refunded.toLocaleString()} refunded · {formatPaise(data.valueRefunded)}
          </p>
        )}
      </div>

      {/* Money stuck in unpaid holds. */}
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
        <p className="text-xs font-medium text-amber-800">Held in pending</p>
        <p className="text-lg font-bold text-amber-900">{formatPaise(data.valueHeldPending)}</p>
        <p className="text-xs text-amber-700">
          {heldPending.toLocaleString()} unpaid booking{heldPending === 1 ? "" : "s"} holding inventory
        </p>
      </div>
    </div>
  );
}
