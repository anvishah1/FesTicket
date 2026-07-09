"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PaymentSidebar from "@/components/payment/PaymentSidebar";
import { getApiUrl } from "@/lib/auth";
import { showToast } from "@/lib/toast";
import { formatPaise } from "@/lib/format";

interface BookingData {
  id: number;
  bookingCode: string;
  status?: string;
  total: number;
  subtotal: number;
  discount?: number;
  promoDiscount?: number; // PAY-04: integer paise redeemed from a promo code
  platformFee: number;
  tax: number;
  expiresAt?: string | null; // PAY-05: ISO time the inventory hold lapses (PENDING only)
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

// mm:ss for a millisecond duration (floored at 0).
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

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

  // PAY-05: tick each second so the hold countdown updates while the booking is
  // PENDING (expiresAt present). Computed from the server expiresAt vs now, so
  // client clock skew only shifts the displayed remaining time, not the source.
  useEffect(() => {
    if (!booking?.expiresAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [booking?.expiresAt]);

  const remainingMs = booking?.expiresAt ? new Date(booking.expiresAt).getTime() - nowMs : null;
  const holdExpired = remainingMs != null && remainingMs <= 0;

  const completeBookingAndRedirect = (bookingCode: string) => {
    localStorage.removeItem("pendingBooking");
    showToast("Payment successful! Redirecting to your confirmation…", "success");
    router.push(`/booking-confirmation?bookingCode=${encodeURIComponent(bookingCode)}`);
  };

  const handlePaymentComplete = async (paymentMethod: string) => {
    if (!booking || processing) return;
    if (holdExpired) {
      showToast("Your ticket hold has expired — please start a new booking.", "error");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/bookings/${booking.id}/complete`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Proves ownership of this booking to the backend (guest-safe): the
          // unguessable bookingCode authorizes completing THIS booking only.
          bookingCode: booking.bookingCode,
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
    if (holdExpired) {
      showToast("Your ticket hold has expired — please start a new booking.", "error");
      return;
    }
    setProcessing(true);
    try {
      const orderRes = await fetch(`${getApiUrl()}/api/bookings/${booking.id}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingCode: booking.bookingCode }),
      });
      const orderData = await orderRes.json();

      if (!orderRes.ok || !orderData.success) {
        if (orderData?.error?.code === "RAZORPAY_DISABLED") {
          // Razorpay isn't configured (demo deployment) — settle via the demo
          // completion path directly. No raw dev-internals dialog is shown; the
          // user already chose to pay.
          await handlePaymentComplete("CARD");
        } else {
          showToast(orderData?.error?.message || "Could not create order.", "error");
          setProcessing(false);
        }
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
          name: "FesTicket",
          description: booking.event?.name || "Event booking",
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string }) => {
            try {
              const verifyRes = await fetch(`${getApiUrl()}/api/bookings/${booking.id}/verify-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  bookingCode: booking.bookingCode,
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
            <div className="h-8 bg-[var(--surface-slate-200)] rounded w-1/2"></div>
            <div className="h-64 bg-[var(--surface-slate-200)] rounded"></div>
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
          <p className="text-[var(--text-soft)] mt-2">Please start a new booking.</p>
          <button
            onClick={() => router.push(`/events/${eventId}/booking`)}
            className="mt-4 px-4 py-2 bg-[var(--fill-ink)] text-white rounded-md"
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

      {/* FE-10: extra bottom padding on mobile so the sticky pay bar never hides content */}
      <main className="container pt-10 pb-28 lg:pb-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-lg bg-[var(--surface)] border p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Payment Methods</h2>
            <p className="text-sm text-[var(--text-soft)] mt-1">Pay securely via UPI, card, or netbanking.</p>

            {/* PAY-05: inventory-hold countdown */}
            {remainingMs != null &&
              (holdExpired ? (
                <div role="alert" className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  Your ticket hold has expired and your seats may have been released.{" "}
                  <button
                    type="button"
                    onClick={() => router.push(`/events/${eventId}/booking`)}
                    className="font-semibold underline"
                  >
                    Start a new booking
                  </button>
                  .
                </div>
              ) : (
                <div
                  className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center gap-2"
                  aria-live="polite"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Seats held for you — <span className="font-mono font-semibold tabular-nums">{mmss(remainingMs)}</span> left to pay.
                </div>
              ))}

            <div className="mt-6">
              <button
                type="button"
                onClick={payWithRazorpay}
                disabled={processing || holdExpired}
                className="w-full py-3 px-4 rounded-lg bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
              >
                {processing ? "Opening…" : holdExpired ? "Hold expired" : `Pay ${formatPaise(amount)}`}
              </button>
              <p className="text-xs text-[var(--text-soft)] mt-3 text-center">You’ll be redirected to a secure payment page.</p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="rounded-lg bg-[var(--surface)] border p-6 shadow-sm">
            <h3 className="font-semibold mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              {booking.items?.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.ticketType.name} × {item.quantity}</span>
                  <span>{formatPaise(item.ticketType.price * item.quantity)}</span>
                </div>
              ))}
              <hr className="my-2" />
              <div className="flex justify-between text-[var(--text-slate)]">
                <span>Subtotal</span>
                <span>{formatPaise(booking.subtotal)}</span>
              </div>
              {booking.discount != null && booking.discount > 0 && (
                <div className="flex justify-between text-green-700" data-testid="payment-discount-line">
                  <span>
                    Discount
                    {booking.subtotal
                      ? ` (${Math.round((booking.discount / booking.subtotal) * 100)}%)`
                      : ""}
                  </span>
                  <span>-{formatPaise(booking.discount)}</span>
                </div>
              )}
              {booking.promoDiscount != null && booking.promoDiscount > 0 && (
                <div className="flex justify-between text-green-700" data-testid="payment-promo-line">
                  <span>Promo discount</span>
                  <span>-{formatPaise(booking.promoDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text-slate)]">
                <span>Platform Fee (2%)</span>
                <span>{formatPaise(booking.platformFee)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-slate)]">
                <span>Tax (18% GST)</span>
                <span>{formatPaise(booking.tax)}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatPaise(booking.total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-[var(--surface)] border p-6 shadow-sm">
            <h3 className="font-semibold">Need help?</h3>
            <p className="text-sm text-[var(--text-slate)] mt-2">
              If you face trouble completing payment, contact our support at{" "}
              <a className="text-[var(--text-primary)] underline" href="mailto:support@FesTicket.events">
                support@FesTicket.events
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

      {/* FE-10: mobile sticky pay bar — live total + the same Pay action as the
          desktop CTA (shared amount + handler). */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border-slate)] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] backdrop-blur px-4 py-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-[var(--text-soft)]">Total to pay</div>
            <div className="text-lg font-bold text-[var(--text-slate-900)]" data-testid="sticky-total">{formatPaise(amount)}</div>
          </div>
          <button
            type="button"
            onClick={payWithRazorpay}
            disabled={processing || holdExpired}
            className={`flex-1 max-w-[60%] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md text-white font-semibold ${
              processing || holdExpired ? "bg-[var(--surface-slate-200)] cursor-not-allowed" : "bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)]"
            }`}
          >
            {processing ? "Opening…" : holdExpired ? "Hold expired" : `Pay ${formatPaise(amount)}`}
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
