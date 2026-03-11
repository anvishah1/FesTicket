"use client";

import React from "react";
import UPIForm from "./UPIForm";
import CardForm from "./CardForm";
import NetbankingList from "./NetbankingList";

type Props = {
  amount: number;
  orderId: string;
  onPaymentComplete?: (method: string) => void;
  processing?: boolean;
};

export default function PaymentTabs({ amount, orderId, onPaymentComplete, processing }: Props) {
  const tabs = ["UPI", "Cards", "Netbanking"] as const;
  const [active, setActive] = React.useState<typeof tabs[number]>("UPI");

  return (
    <div className="flex gap-6">
      <nav className="w-36 border-r pr-4">
        <ul className="space-y-2">
          {tabs.map((t) => (
            <li key={t}>
              <button
                onClick={() => setActive(t)}
                className={`w-full text-left px-3 py-3 rounded-md flex items-center gap-3 ${
                  active === t
                    ? "bg-primary-50 text-primary-700 font-medium border-l-2 border-primary-500"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1">
        {active === "UPI" && (
          <UPIForm 
            amount={amount} 
            orderId={orderId} 
            onPaymentComplete={() => onPaymentComplete?.("UPI")}
            processing={processing}
          />
        )}
        {active === "Cards" && (
          <CardForm 
            amount={amount} 
            orderId={orderId}
            onPaymentComplete={() => onPaymentComplete?.("CARD")}
            processing={processing}
          />
        )}
        {active === "Netbanking" && (
          <NetbankingList 
            amount={amount} 
            orderId={orderId}
            onPaymentComplete={() => onPaymentComplete?.("NETBANKING")}
            processing={processing}
          />
        )}
      </div>
    </div>
  );
}
