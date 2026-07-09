"use client";

import React from "react";
import { formatPaise } from "@/lib/format";

type Props = {
  amount: number;
  orderId: string;
  onPaymentComplete?: () => void;
  processing?: boolean;
};

export default function UPIForm({ amount, onPaymentComplete, processing: externalProcessing }: Props) {
  const [upiId, setUpiId] = React.useState("");
  const [qrShown, setQrShown] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);

  const isProcessing = processing || externalProcessing;

  function generateQRCode() {
    setQrShown(true);
  }

  async function verifyAndPay() {
    if (!upiId.trim()) {
      alert("Please enter a valid UPI ID or use QR code.");
      return;
    }
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setProcessing(false);
    
    if (onPaymentComplete) {
      onPaymentComplete();
    } else {
      alert("Mock: Payment request sent to UPI ID — success (demo).");
    }
  }

  async function handleQRPaid() {
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setProcessing(false);
    
    if (onPaymentComplete) {
      onPaymentComplete();
    } else {
      alert("Mock: UPI QR scanned & paid (demo).");
    }
  }

  return (
    <div>
      <div className="w-full">
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-[var(--text-slate)] mb-3">Pay by any UPI app</div>

          {qrShown ? (
            <div className="flex items-center gap-4">
              <div className="w-40 h-40 rounded-md bg-[var(--surface)] border flex items-center justify-center">
                <div className="w-32 h-32 bg-[var(--surface-slate-200)] flex items-center justify-center text-xs text-[var(--text-faint)]">
                  QR Code
                </div>
              </div>
              <div>
                <div className="text-sm text-[var(--text-strong)]">Scan this QR code using your UPI app</div>
                <div className="text-xs text-[var(--text-soft)] mt-1">Amount: {formatPaise(amount)}</div>
                <div className="mt-3">
                  <button
                    onClick={handleQRPaid}
                    disabled={isProcessing}
                    className="inline-block bg-[var(--fill-ink)] text-white px-4 py-2 rounded-md disabled:opacity-50"
                  >
                    {isProcessing ? "Processing…" : "I have paid"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <button 
                onClick={generateQRCode} 
                className="bg-[var(--fill-ink)] text-white px-4 py-2 rounded-md"
              >
                Generate QR Code
              </button>

              <div className="my-4 flex items-center gap-3">
                <div className="flex-grow border-t" />
                <div className="text-xs text-[var(--text-faint)]">OR</div>
                <div className="flex-grow border-t" />
              </div>

              <label className="text-xs text-[var(--text-soft)]">UPI ID</label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2"
                placeholder="username@bank"
                aria-label="UPI ID"
              />

              <div className="mt-3">
                <button 
                  onClick={verifyAndPay} 
                  disabled={isProcessing}
                  className="bg-green-600 text-white px-4 py-2 rounded-md disabled:opacity-50"
                >
                  {isProcessing ? "Verifying…" : `Pay ${formatPaise(amount)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
