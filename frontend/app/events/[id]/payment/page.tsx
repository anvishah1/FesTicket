"use client";

import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PaymentTabs from "@/components/payment/PaymentTabs";
import PaymentSidebar from "@/components/payment/PaymentSidebar";

export default function PaymentPage() {
  // Mock amount & event data (replace with props / fetch later)
  const eventTitle = "Power & Energy Research Conclave (PERC 2026)";
  const amount = 500; // single-ticket example
  const orderId = "ORDER-12345";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />

      <main className="container py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-lg bg-white border p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Payment Methods</h2>
            <p className="text-sm text-slate-500 mt-1">Choose your preferred payment method.</p>

            <div className="mt-6">
              <PaymentTabs amount={amount} orderId={orderId} />
            </div>
          </div>

          <div className="rounded-lg bg-white border p-6 shadow-sm">
            <h3 className="font-semibold">Need help?</h3>
            <p className="text-sm text-slate-600 mt-2">
              If you face trouble completing payment, contact our support at{" "}
              <a className="text-primary-600 underline" href="mailto:support@tiqrdupe.local">
                support@tiqrdupe.local
              </a>
              .
            </p>
          </div>
        </section>

        <aside className="space-y-6">
          <PaymentSidebar title={eventTitle} amount={amount} orderId={orderId} />
        </aside>
      </main>

      <Footer />
    </div>
  );
}
