// frontend/components/admin/EventComparisonTable.tsx
// ANL-04: sortable per-event comparison. Click a numeric header to sort (default
// revenue desc). Sell-through shows a progress bar (capped at 100%).
"use client";

import { useMemo, useState } from "react";
import { formatPaise } from "@/lib/format";

export interface EventRow {
  eventId: number;
  name: string;
  revenue: number; // paise
  ticketsSold: number;
  capacity: number;
  sellThrough: number; // 0..1
  bookings: number;
  conversion: number; // 0..1
}

type SortKey = "revenue" | "ticketsSold" | "sellThrough" | "bookings" | "conversion";

const COLS: { key: SortKey; label: string; align: "right" }[] = [
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "ticketsSold", label: "Sold", align: "right" },
  { key: "sellThrough", label: "Sell-through", align: "right" },
  { key: "bookings", label: "Bookings", align: "right" },
  { key: "conversion", label: "Conv.", align: "right" },
];

const pctStr = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;

export default function EventComparisonTable({ rows }: { rows: EventRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (dir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return copy;
  }, [rows, sortKey, dir]);

  function toggle(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir("desc");
    }
  }

  if (!rows.length) {
    return <p className="text-sm text-[var(--text-muted)]">No events to compare yet.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-card)]">
            <th className="py-2 pr-3 font-medium">Event</th>
            {COLS.map((c) => (
              <th key={c.key} className="py-2 px-3 font-medium text-right">
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  aria-sort={sortKey === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}
                  className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
                >
                  {c.label}
                  <span aria-hidden="true" className="text-[10px]">
                    {sortKey === c.key ? (dir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.eventId} className="border-b border-[var(--border-card)] last:border-0">
              <td className="py-2.5 pr-3 text-[var(--text-primary)] font-medium max-w-[220px] truncate">{r.name}</td>
              <td className="py-2.5 px-3 text-right text-[var(--text-primary)] tabular-nums">{formatPaise(r.revenue)}</td>
              <td className="py-2.5 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                {r.ticketsSold.toLocaleString()}
                <span className="text-[var(--text-muted)]">/{r.capacity.toLocaleString()}</span>
              </td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2 justify-end">
                  <div className="h-1.5 w-16 rounded-full bg-[var(--surface-slate-100)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--fill-plum)]"
                      style={{ width: pctStr(r.sellThrough) }}
                    />
                  </div>
                  <span className="text-[var(--text-muted)] tabular-nums w-9 text-right">{pctStr(r.sellThrough)}</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-right text-[var(--text-secondary)] tabular-nums">{r.bookings.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right text-[var(--text-secondary)] tabular-nums">{pctStr(r.conversion)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
