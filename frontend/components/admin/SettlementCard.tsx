// frontend/components/admin/SettlementCard.tsx
// ANL-08: settlement receipt. Reconciles gross collected minus the pass-through
// platform fee and GST into the organiser's net payout (which excludes fee + GST),
// with refunded/cancelled reported separately. All values are paise.
"use client";

import { formatPaise } from "@/lib/format";

export interface SettlementData {
  grossCollected: number;
  platformFees: number;
  gst: number;
  discounts: number;
  netToOrganizer: number;
  refundedTotal: number;
  cancelledTotal: number;
}

function Row({ label, value, sign }: { label: string; value: number; sign?: "minus" }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--text-secondary)]">
        {sign === "minus" ? "− " : ""}
        {formatPaise(value)}
      </span>
    </div>
  );
}

export default function SettlementCard({ data }: { data: SettlementData }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Settlement</h2>

      <div className="divide-y divide-[var(--border-card)]">
        <Row label="Gross collected" value={data.grossCollected} />
        <Row label="Platform fee (2%)" value={data.platformFees} sign="minus" />
        <Row label="GST (18%)" value={data.gst} sign="minus" />
      </div>

      <div className="mt-2 pt-2 border-t-2 border-[var(--border-plum)] flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Net payout to organiser</span>
        <span className="text-lg font-bold text-green-600 tabular-nums">{formatPaise(data.netToOrganizer)}</span>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-1">
        Fee + GST are pass-through and excluded from your payout.
      </p>

      {(data.refundedTotal > 0 || data.cancelledTotal > 0) && (
        <div className="mt-3 pt-3 border-t border-[var(--border-card)] space-y-1">
          {data.refundedTotal > 0 && (
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Refunded (excluded)</span>
              <span className="tabular-nums">{formatPaise(data.refundedTotal)}</span>
            </div>
          )}
          {data.cancelledTotal > 0 && (
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Cancelled (excluded)</span>
              <span className="tabular-nums">{formatPaise(data.cancelledTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
