"use client";

import React from "react";

export default function UPIForm({ amount, orderId }: { amount: number; orderId: string }) {
  const [upiId, setUpiId] = React.useState("");
  const [qrShown, setQrShown] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);

  function generateQRCode() {
    // In a real flow you'd request a QR / txn from backend
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
    alert("Mock: Payment request sent to UPI ID — success (demo).");
  }

  return (
    <div>
      <div className="w-full">
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-slate-600 mb-3">Pay by any UPI app</div>

          {qrShown ? (
            <div className="flex items-center gap-4">
              <div className="w-40 h-40 rounded-md bg-white border flex items-center justify-center">
                {/* placeholder QR */}
                <div className="w-32 h-32 bg-slate-200" />
              </div>
              <div>
                <div className="text-sm text-slate-700">Scan this QR code using your UPI app</div>
                <div className="mt-3">
                  <button
                    onClick={() => {
                      setProcessing(true);
                      setTimeout(() => {
                        setProcessing(false);
                        alert("Mock: UPI QR scanned & paid (demo).");
                      }, 1200);
                    }}
                    className="inline-block bg-primary-600 text-white px-4 py-2 rounded-md"
                  >
                    {processing ? "Processing…" : "I have paid"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <button onClick={generateQRCode} className="bg-primary-600 text-white px-4 py-2 rounded-md">
                Generate QR Code
              </button>

              <div className="my-4 flex items-center gap-3">
                <div className="flex-grow border-t" />
                <div className="text-xs text-slate-400">OR</div>
                <div className="flex-grow border-t" />
              </div>

              <label className="text-xs text-slate-500">UPI ID</label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2"
                placeholder="username@bank"
                aria-label="UPI ID"
              />

              <div className="mt-3">
                <button onClick={verifyAndPay} className="bg-green-600 text-white px-4 py-2 rounded-md">
                  {processing ? "Verifying…" : "Verify and Pay"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
