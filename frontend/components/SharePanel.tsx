"use client";

import { useEffect, useState } from "react";
import { showToast } from "@/lib/toast";

// SEO-09: post-booking referral share panel. Builds a share link back to the
// event carrying ?ref={bookingId} so a resulting booking can be attributed.
// IMPORTANT: the ref is the referring booking's numeric id — NOT its bookingCode,
// which is a secret capability token (it alone authorizes reading a booking's PII
// and transferring/stealing the ticket). Broadcasting the id is safe; the id-keyed
// endpoints all require ownership. WhatsApp deep link + native share
// (feature-detected) + copy-to-clipboard. Share text carries NO PII.

export default function SharePanel({
  eventId,
  bookingId,
  eventName,
}: {
  eventId: number;
  bookingId: number;
  eventName?: string | null;
}) {
  // Prefer the configured site origin; fall back to the browser origin only after
  // mount so the SSR and first client render agree (no hydration mismatch).
  const [origin, setOrigin] = useState((process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, ""));
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SITE_URL && typeof window !== "undefined") {
      setOrigin(window.location.origin.replace(/\/$/, ""));
    }
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const shareUrl = `${origin}/events/${eventId}?ref=${encodeURIComponent(String(bookingId))}`;
  const message = `Check out ${eventName || "this event"} on FesTicket!`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${message} ${shareUrl}`)}`;

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: message, text: message, url: shareUrl });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Share link copied to clipboard", "success");
    } catch {
      showToast("Couldn't copy the link", "error");
    }
  };

  return (
    <div className="border-t pt-4" data-testid="share-panel">
      <h3 className="text-sm font-medium text-[var(--text-soft)] mb-1">Bring your friends</h3>
      <p className="text-sm text-[var(--text-soft)] mb-3">Share this event — the more the merrier.</p>
      <div className="flex flex-wrap gap-3">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Share on WhatsApp
        </a>
        {canNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold text-[var(--text-strong)] hover:bg-[var(--surface-slate)]"
          >
            Share…
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          data-testid="copy-link"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold text-[var(--text-strong)] hover:bg-[var(--surface-slate)]"
        >
          Copy link
        </button>
      </div>
    </div>
  );
}
