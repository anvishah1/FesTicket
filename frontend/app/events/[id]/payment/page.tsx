"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PaymentSidebar from "@/components/payment/PaymentSidebar";
import { getApiUrl } from "@/lib/auth";
import { showToast } from "@/lib/toast";

interface BookingData {
  id: number;
  bookingCode: string;
  status?: string;
  total: number;
  subtotal: number;
  discount?: number;
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
  const bookingCode = searchParams.get("bookingCode");

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingCode) {
        // Try to get from localStorage
        const pending = localStorage.getItem("pendingBooking");
        if (pending) {
          const data = JSON.parse(pending);
          // Fetch full booking details via the public guest-confirmation endpoint
          // (bookingCode is an unguessable cuid, so this stays unauthenticated).
          try {
            const res = await fetch(`${getApiUrl()}/api/bookings/code/${data.bookingCode}`);
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
        // Public guest endpoint keyed by the unguessable bookingCode (no auth).
        const res = await fetch(`${getApiUrl()}/api/bookings/code/${bookingCode}`);
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
  }, [bookingCode]);

  const completeBookingAndRedirect = (bookingCode: string) => {
    localStorage.removeItem("pendingBooking");
    showToast("Payment successful! Redirecting to your confirmation…", "success");
    router.push(`/booking-confirmation?bookingCode=${encodeURIComponent(bookingCode)}`);
  };

  const handlePaymentComplete = async (paymentMethod: string) => {
    if (!booking || processing) return;
    setProcessing(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/bookings/${booking.id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: `TXN-${Date.now()}`,
          paymentMethod: paymentMethod.toUpperCase(),
        }),
      });
      const data = await res.json();
      if (data.success) completeBookingAndRedirect(booking.bookingCode);
      else showToast(data.error?.message || "Payment failed. Please try again.", "error");
    } catch (error) {
      console.error("Payment error:", error);
      showToast("Payment failed. Please try again.", "error");
    } finally {
      setProcessing(false);
    }
  };

  const payWithRazorpay = async () => {
    if (!booking || processing) return;
    setProcessing(true);
    try {
      const orderRes = await fetch(`${getApiUrl()}/api/bookings/${booking.id}/create-order`, { method: "POST" });
      const orderData = await orderRes.json();

      if (!orderRes.ok || !orderData.success) {
        if (orderData?.error?.code === "RAZORPAY_DISABLED") {
          if (confirm("Razorpay is not configured. Use demo payment instead?")) {
            await handlePaymentComplete("CARD");
          }
        } else {
          showToast(orderData?.error?.message || "Could not create order.", "error");
        }
        setProcessing(false);
        return;
      }

      const { orderId, amount, currency, keyId } = orderData.data;
      if (!keyId) {
        await handlePaymentComplete("CARD");
        setProcessing(false);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);

      const loadCheckout = () => {
        const Razorpay = (window as unknown as { Razorpay: { new (options: unknown): { open: () => void } } }).Razorpay;
        if (!Razorpay) {
          setTimeout(loadCheckout, 100);
          return;
        }
        const options = {
          key: keyId,
          amount,
          currency,
          order_id: orderId,
          name: "tiqr",
          description: booking.event?.name || "Event booking",
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string }) => {
            try {
              const verifyRes = await fetch(`${getApiUrl()}/api/bookings/${booking.id}/verify-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) completeBookingAndRedirect(booking.bookingCode);
              else showToast(verifyData.error?.message || "Payment verification failed.", "error");
            } catch (e) {
              console.error(e);
              showToast("Verification failed. Please contact support with your booking code.", "error");
            } finally {
              setProcessing(false);
            }
          },
          modal: { ondismiss: () => setProcessing(false) },
        };
        const rzp = new Razorpay(options);
        rzp.open();
      };

      script.onload = loadCheckout;
      script.onerror = () => {
        showToast("Could not load payment. Try again or use another method.", "error");
        setProcessing(false);
      };
    } catch (error) {
      console.error("Razorpay error:", error);
      showToast("Payment failed. Please try again.", "error");
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
            <p className="text-sm text-slate-500 mt-1">Pay securely via UPI, card, or netbanking.</p>

            <div className="mt-6">
              <button
                type="button"
                onClick={payWithRazorpay}
                disabled={processing}
                className="w-full py-3 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
              >
                {processing ? "Opening…" : `Pay ₹${amount.toLocaleString()}`}
              </button>
              <p className="text-xs text-slate-500 mt-3 text-center">You’ll be redirected to a secure payment page.</p>
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
              {booking.discount != null && booking.discount > 0 && (
                <div className="flex justify-between text-green-700" data-testid="payment-discount-line">
                  <span>
                    Discount
                    {booking.subtotal
                      ? ` (${Math.round((booking.discount / booking.subtotal) * 100)}%)`
                      : ""}
                  </span>
                  <span>-₹{booking.discount.toLocaleString()}</span>
                </div>
              )}
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
