import React from "react";

export default function PaymentSidebar({ title, amount, orderId }: { title: string; amount: number; orderId: string }) {
  return (
    <div className="rounded-lg p-4 border bg-white shadow-sm">
      <h4 className="font-semibold">Payment Summary</h4>

      <div className="mt-3 text-sm text-slate-600">{title}</div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="text-slate-600">Order</div>
        <div className="text-right font-mono text-xs">{orderId}</div>

        <div className="text-slate-600">Subtotal</div>
        <div className="text-right">₹{amount}</div>

        <div className="text-slate-600">Fees</div>
        <div className="text-right">₹{Math.round(amount * 0.02)}</div>

        <div className="text-slate-600">Tax</div>
        <div className="text-right">₹{Math.round((amount + amount * 0.02) * 0.18)}</div>

        <div className="col-span-2 border-t mt-2 pt-2 flex items-center justify-between">
          <div className="font-semibold">Total</div>
          <div className="text-2xl font-bold">₹{amount + Math.round(amount * 0.02) + Math.round((amount + amount * 0.02) * 0.18)}</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Payments are processed securely. This demo uses a mock gateway.
      </div>
    </div>
  );
}
