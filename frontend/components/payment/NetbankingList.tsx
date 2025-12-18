"use client";

import React from "react";

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

export default function NetbankingList({ amount }: { amount: number; orderId?: string }) {
  const [selected, setSelected] = React.useState<string | null>(null);

  function proceed() {
    if (!selected) {
      alert("Select a bank to continue.");
      return;
    }
    // Mock netbanking flow
    alert(`Mock: starting netbanking flow with ${selected} — amount ₹${amount}`);
  }

  return (
    <div className="w-full">
      <div className="p-4 border rounded-lg">
        <div className="text-sm text-slate-600">Net Banking</div>

        <div className="mt-3 border rounded-md max-h-64 overflow-auto">
          {BANKS.map((b) => (
            <button key={b} onClick={() => setSelected(b)} className={`w-full text-left px-4 py-3 border-b last:border-b-0 ${selected === b ? "bg-primary-50 text-primary-700" : "hover:bg-slate-50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs">{b.charAt(0)}</div>
                  <div className="text-sm">{b}</div>
                </div>
                <div className="text-xs text-slate-400">{selected === b ? "Selected" : ""}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <button onClick={proceed} className="bg-primary-600 text-white px-4 py-2 rounded-md">
            Proceed to Bank
          </button>
        </div>
      </div>
    </div>
  );
}
