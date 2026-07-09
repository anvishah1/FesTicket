"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";
import { formatPaise } from "@/lib/format";

// PAY-08: waitlist claim landing. Validates the token and deep-links into the
// booking flow for the freed ticket type.
type Claim = {
  eventId: number;
  ticketTypeId: number;
  event?: { id: number; name?: string; venue?: string; startDate?: string };
  ticketType?: { id: number; name?: string; price?: number };
  claimExpiresAt?: string;
};

export default function WaitlistClaimPage() {
  const params = useParams();
  const token = params?.token as string;
  const [state, setState] = useState<"loading" | "ok" | "expired" | "invalid">("loading");
  const [claim, setClaim] = useState<Claim | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/waitlist/claim/${encodeURIComponent(token)}`);
        const body = await res.json();
        if (res.ok && body.success) {
          setClaim(body.data);
          setState("ok");
        } else {
          setState(body?.error?.code === "CLAIM_EXPIRED" ? "expired" : "invalid");
        }
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-12 max-w-lg">
        <div className="rounded-xl bg-[var(--surface)] border shadow-sm p-8 text-center">
          {state === "loading" && <p className="text-[var(--text-soft)]">Checking your claim…</p>}

          {state === "ok" && claim && (
            <>
              <h1 className="text-xl font-bold">A ticket is waiting for you 🎟️</h1>
              <p className="text-[var(--text-slate)] mt-2">
                A <span className="font-medium">{claim.ticketType?.name || "ticket"}</span> for{" "}
                <span className="font-medium">{claim.event?.name || "the event"}</span> just opened up.
              </p>
              {claim.ticketType?.price != null && (
                <p className="text-[var(--text-soft)] mt-1">{formatPaise(claim.ticketType.price)}</p>
              )}
              {claim.claimExpiresAt && (
                <p className="text-xs text-amber-600 mt-3">
                  Claim before {new Date(claim.claimExpiresAt).toLocaleString()} — it&apos;s offered to the next person after that.
                </p>
              )}
              <Link
                href={`/events/${claim.eventId}/booking`}
                className="inline-block mt-5 px-5 py-2.5 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold"
              >
                Book now
              </Link>
            </>
          )}

          {state === "expired" && (
            <>
              <h1 className="text-xl font-bold">This claim has expired</h1>
              <p className="text-[var(--text-slate)] mt-2">
                The seat has been offered to the next person on the waitlist. You can re-join the waitlist from the event page.
              </p>
              <Link href="/fests" className="inline-block mt-5 px-5 py-2.5 rounded-md border font-semibold hover:bg-[var(--surface-slate)]">
                Discover events
              </Link>
            </>
          )}

          {state === "invalid" && (
            <>
              <h1 className="text-xl font-bold">Claim link invalid</h1>
              <p className="text-[var(--text-slate)] mt-2">This link is invalid or has already been used.</p>
              <Link href="/fests" className="inline-block mt-5 px-5 py-2.5 rounded-md border font-semibold hover:bg-[var(--surface-slate)]">
                Discover events
              </Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
