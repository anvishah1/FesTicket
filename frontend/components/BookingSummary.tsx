// frontend/components/BookingSummary.tsx

import { formatCurrency } from "@/lib/format";

export default function BookingSummary({
  subtotal,
  platformFee,
  tax,
  total,
  items,
}: {
  subtotal: number;
  platformFee: number;
  tax: number;
  total: number;
  items: { id: string; name: string; price: number; available: number; qty: number }[];
}) {
  return (
    <div className="rounded-lg p-5 border bg-white shadow-sm">
      <h4 className="font-semibold mb-3">Summary</h4>

      <div className="space-y-2">
        {items.filter((it) => it.qty > 0).map((it) => (
          <div className="flex items-start justify-between text-sm" key={it.id}>
            <div>
              <div className="font-medium">{it.name}</div>
              <div className="text-xs text-slate-500">Qty {it.qty} × {formatCurrency(it.price)}</div>
            </div>
            <div className="font-medium">{formatCurrency(it.qty * it.price)}</div>
          </div>
        ))}

        <hr className="my-3" />
        <div className="flex justify-between text-sm">
          <div className="text-slate-600">Subtotal</div>
          <div>{formatCurrency(subtotal)}</div>
        </div>
        <div className="flex justify-between text-sm">
          <div className="text-slate-600">Platform fee</div>
          <div>{formatCurrency(platformFee)}</div>
        </div>
        <div className="flex justify-between text-sm">
          <div className="text-slate-600">Tax</div>
          <div>{formatCurrency(tax)}</div>
        </div>

        <div className="flex justify-between items-center mt-4">
          <div className="text-sm font-medium">Total</div>
          <div className="text-xl font-bold">{formatCurrency(total)}</div>
        </div>
      </div>
    </div>
  );
}
