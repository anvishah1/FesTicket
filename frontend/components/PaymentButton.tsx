// frontend/components/PaymentButton.tsx
"use client";
import React from "react";
import { formatPaise } from "@/lib/format";

export default function PaymentButton({
  amount,
  disabled,
  onSuccess,
}: {
  amount: number;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = React.useState(false);

  async function pay() {
    if (disabled || loading) return;
    setLoading(true);

    // Mock payment delay
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    if (onSuccess) onSuccess();
  }

  return (
    <button
      onClick={pay}
      disabled={disabled || loading}
      className={`w-full inline-flex items-center justify-center gap-3 px-4 py-2 rounded-md text-white font-semibold ${
        disabled ? "bg-slate-300 cursor-not-allowed" : "bg-primary-600 hover:bg-primary-700"
      }`}
      aria-label={`Pay ${amount / 100} rupees`}
    >
      {loading ? "Processing…" : `Pay ${formatPaise(amount)}`}
    </button>
  );
}
