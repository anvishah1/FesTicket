// frontend/components/admin/TicketTypePanel.tsx
// ANL-09: fest-wide ticket-type sell-through. Sell-through bars, each type's share
// of total ticket revenue (revenue mix), and Near-sold-out / Low-selling badges.
"use client";

import { useMemo } from "react";
import { formatPaise } from "@/lib/format";

export interface TicketTypeRow {
  ticketTypeId: number;
  eventId: number;
  eventName: string;
  name: string;
  price: number; // paise
  quantity: number;
  sold: number;
  available: number;
  sellThrough: number; // 0..1
  revenue: number; // paise
  nearSoldOut: boolean;
  lowSelling: boolean;
}

const pctStr = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;

export default function TicketTypePanel({ rows }: { rows: TicketTypeRow[] }) {
  const { sorted, totalRevenue } = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.revenue, 0);
    return { sorted: [...rows].sort((a, b) => b.revenue - a.revenue), totalRevenue: total };
  }, [rows]);

  if (!rows.length) {
    return <p className="text-sm text-[var(--text-muted)]">No ticket types yet.</p>;
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {sorted.map((r) => {
        const share = totalRevenue > 0 ? r.revenue / totalRevenue : 0;
        return (
          <div key={r.ticketTypeId} className="border-b border-[var(--border-card)] last:border-0 pb-3 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{r.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{r.eventName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatPaise(r.revenue)}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{pctStr(share)} of revenue</p>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-[var(--surface-slate-100)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${r.nearSoldOut ? "bg-[#B42318]" : "bg-[var(--fill-plum)]"}`}
                  style={{ width: pctStr(r.sellThrough) }}
                />
              </div>
              <span className="text-xs text-[var(--text-muted)] tabular-nums w-24 text-right">
                {r.sold.toLocaleString()}/{r.quantity.toLocaleString()} · {pctStr(r.sellThrough)}
              </span>
            </div>

            {(r.nearSoldOut || r.lowSelling) && (
              <div className="mt-1.5 flex gap-2">
                {r.nearSoldOut && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Near sold out
                  </span>
                )}
                {r.lowSelling && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Low selling
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
