"use client";

import React from "react";

type Props = {
  amount: number;
  orderId?: string;
  onPaymentComplete?: () => void;
  processing?: boolean;
};

export default function CardForm({ amount, onPaymentComplete, processing: externalProcessing }: Props) {
  const [cardNumber, setCardNumber] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [cvv, setCvv] = React.useState("");
  const [processing, setProcessing] = React.useState(false);

  const isProcessing = processing || externalProcessing;

  function validCard() {
    return cardNumber.replace(/\s/g, "").length >= 12 && expiry.trim() && cvv.trim().length >= 3;
  }

  async function pay() {
    if (!validCard()) {
      alert("Please fill valid card details.");
      return;
    }
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setProcessing(false);
    
    if (onPaymentComplete) {
      onPaymentComplete();
    } else {
      alert("Mock: Card payment successful (demo).");
    }
  }

  return (
    <div className="w-full">
      <div className="p-4 border rounded-lg">
        <div className="text-sm text-slate-600">Enter Card Details</div>

        <div className="mt-4">
          <label className="text-xs text-slate-500">Card number</label>
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="Enter Card Number"
            className="mt-1 w-full border rounded-md px-3 py-2"
            inputMode="numeric"
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Expiry (MM/YY)</label>
              <input 
                value={expiry} 
                onChange={(e) => setExpiry(e.target.value)} 
                placeholder="MM/YY" 
                className="mt-1 w-full border rounded-md px-3 py-2" 
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">CVV</label>
              <input 
                value={cvv} 
                onChange={(e) => setCvv(e.target.value)} 
                placeholder="CVV" 
                className="mt-1 w-full border rounded-md px-3 py-2" 
                inputMode="numeric" 
              />
            </div>
          </div>

          <div className="mt-4">
            <button 
              onClick={pay} 
              disabled={!validCard() || isProcessing} 
              className={`px-4 py-2 rounded-md text-white ${
                validCard() && !isProcessing 
                  ? "bg-primary-600 hover:bg-primary-700" 
                  : "bg-slate-300 cursor-not-allowed"
              }`}
            >
              {isProcessing ? "Processing…" : `Pay ₹${amount.toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
