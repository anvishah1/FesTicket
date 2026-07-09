"use client";

import React from "react";
import { formatPaise } from "@/lib/format";

const BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Netbanking",
  "Axis Bank",
  "AU Small Finance Bank",
  "Andhra Bank",
  "Bandhan Bank",
  "Bank of Baroda",
  "Canara Bank",
];

type Props = {
  amount: number;
  orderId?: string;
  onPaymentComplete?: () => void;
  processing?: boolean;
};

export default function NetbankingList({ amount, onPaymentComplete, processing }: Props) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [localProcessing, setLocalProcessing] = React.useState(false);

  const isProcessing = localProcessing || processing;

  async function proceed() {
    if (!selected) {
      alert("Select a bank to continue.");
      return;
    }
    
    setLocalProcessing(true);
    // Simulate bank redirect and return
    await new Promise((r) => setTimeout(r, 1500));
    setLocalProcessing(false);
    
    if (onPaymentComplete) {
      onPaymentComplete();
    } else {
      alert(`Mock: Payment successful via ${selected}`);
    }
  }

  return (
    <div className="w-full">
      <div className="p-4 border rounded-lg">
        <div className="text-sm text-[var(--text-slate)]">Net Banking</div>

        <div className="mt-3 border rounded-md max-h-64 overflow-auto">
          {BANKS.map((b) => (
            <button 
              key={b} 
              onClick={() => setSelected(b)} 
              disabled={isProcessing}
              className={`w-full text-left px-4 py-3 border-b last:border-b-0 ${
                selected === b ? "bg-[var(--surface-page)] text-[var(--text-primary)]" : "hover:bg-[var(--surface-slate)]"
              } ${isProcessing ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-slate-100)] flex items-center justify-center text-xs">
                    {b.charAt(0)}
                  </div>
                  <div className="text-sm">{b}</div>
                </div>
                <div className="text-xs text-[var(--text-faint)]">{selected === b ? "Selected" : ""}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <button 
            onClick={proceed} 
            disabled={!selected || isProcessing}
            className={`px-4 py-2 rounded-md text-white ${
              selected && !isProcessing
                ? "bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)]"
                : "bg-[var(--surface-slate-200)] cursor-not-allowed"
            }`}
          >
            {isProcessing ? "Processing…" : `Pay ${formatPaise(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
