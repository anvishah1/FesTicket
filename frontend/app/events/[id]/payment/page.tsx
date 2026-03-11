"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PaymentTabs from "@/components/payment/PaymentTabs";
import PaymentSidebar from "@/components/payment/PaymentSidebar";

interface BookingData {
  id: number;
  bookingCode: string;
  total: number;
  subtotal: number;
  platformFee: number;
  tax: number;
  event: {
    name: string;
    venue: string;
    startDate: string;
  };
  items: Array<{
    quantity: number;
    ticketType: { name: string; price: number };
  }>;
}

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const bookingId = searchParams.get("bookingId");

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) {
        // Try to get from localStorage
        const pending = localStorage.getItem("pendingBooking");
        if (pending) {
          const data = JSON.parse(pending);
          // Fetch full booking details
          try {
            const res = await fetch(`http://localhost:4000/api/bookings/${data.bookingId}`);
            const result = await res.json();
            if (result.success) {
              setBooking(result.data);
            }
          } catch (error) {
            console.error("Failed to fetch booking:", error);
          }
        }
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`http://localhost:4000/api/bookings/${bookingId}`);
        const data = await res.json();
        if (data.success) {
          setBooking(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch booking:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  const handlePaymentComplete = async (paymentMethod: string) => {
    if (!booking || processing) return;

    setProcessing(true);

    try {
      // Complete the booking
      const res = await fetch(`http://localhost:4000/api/bookings/${booking.id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: `TXN-${Date.now()}`,
          paymentMethod: paymentMethod.toUpperCase(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Clear pending booking
        localStorage.removeItem("pendingBooking");
        
        // Show success and redirect
        alert(`Payment successful! Your booking code is: ${booking.bookingCode}`);
        router.push(`/fests`);
      } else {
        alert(data.error?.message || "Payment failed. Please try again.");
      }
    } catch (error) {
      console.error("Payment error:", error);
      alert("Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header />
        <main className="container py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header />
        <main className="container py-10 text-center">
          <h1 className="text-2xl font-bold">Booking not found</h1>
          <p className="text-slate-500 mt-2">Please start a new booking.</p>
          <button
            onClick={() => router.push(`/events/${eventId}/booking`)}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md"
          >
            Start New Booking
          </button>
        </main>
      </div>
    );
  }

  const eventTitle = booking.event?.name || "Event";
  const amount = booking.total;
  const orderId = booking.bookingCode;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />

      <main className="container py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-lg bg-white border p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Payment Methods</h2>
            <p className="text-sm text-slate-500 mt-1">Choose your preferred payment method.</p>

            <div className="mt-6">
              <PaymentTabs 
                amount={amount} 
                orderId={orderId} 
                onPaymentComplete={handlePaymentComplete}
                processing={processing}
              />
            </div>
          </div>

          {/* Order Summary */}
          <div className="rounded-lg bg-white border p-6 shadow-sm">
            <h3 className="font-semibold mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              {booking.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.ticketType.name} × {item.quantity}</span>
                  <span>₹{(item.ticketType.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <hr className="my-2" />
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>₹{booking.subtotal?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Platform Fee (2%)</span>
                <span>₹{booking.platformFee?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax (18% GST)</span>
                <span>₹{booking.tax?.toLocaleString()}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>₹{booking.total?.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white border p-6 shadow-sm">
            <h3 className="font-semibold">Need help?</h3>
            <p className="text-sm text-slate-600 mt-2">
              If you face trouble completing payment, contact our support at{" "}
              <a className="text-primary-600 underline" href="mailto:support@tiqr.events">
                support@tiqr.events
              </a>
            </p>
          </div>
        </section>

        <aside className="space-y-6">
          <PaymentSidebar 
            title={eventTitle} 
            amount={amount} 
            orderId={orderId}
            venue={booking.event?.venue}
            date={booking.event?.startDate}
          />
        </aside>
      </main>

      <Footer />
    </div>
  );
}
