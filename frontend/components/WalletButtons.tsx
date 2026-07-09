"use client";

import { getApiUrl } from "@/lib/auth";

// TIX-07: Apple / Google wallet buttons. Rendered only when the corresponding
// backend endpoint is live (the parent probes /wallet/availability and passes
// the flags). Both are plain links: Apple downloads the .pkpass; Google uses the
// endpoint's redirect mode to bounce straight to the save flow.
export default function WalletButtons({
  bookingCode,
  ticketCode,
  apple,
  google,
  compact = false,
}: {
  bookingCode: string;
  ticketCode?: string;
  apple: boolean;
  google: boolean;
  compact?: boolean;
}) {
  if (!apple && !google) return null;

  const base = `${getApiUrl()}/api/bookings/code/${encodeURIComponent(bookingCode)}`;
  const codeQ = ticketCode ? `ticketCode=${encodeURIComponent(ticketCode)}` : "";
  const appleHref = `${base}/apple-pass${codeQ ? `?${codeQ}` : ""}`;
  const googleHref = `${base}/google-pass?${codeQ ? `${codeQ}&` : ""}redirect=1`;

  const btn = compact
    ? "text-[11px] px-2 py-1 rounded-md font-medium"
    : "text-sm px-3 py-2 rounded-md font-medium";

  return (
    <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-3"}`} data-testid="wallet-buttons">
      {apple && (
        <a href={appleHref} className={`${btn} bg-black text-white hover:bg-[var(--surface-slate-800)]`} data-testid="apple-wallet-button">
          {compact ? "Apple" : "Add to Apple Wallet"}
        </a>
      )}
      {google && (
        <a
          href={googleHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} border border-[var(--border-slate)] text-[var(--text-strong)] hover:bg-[var(--surface-slate)]`}
          data-testid="google-wallet-button"
        >
          {compact ? "Google" : "Save to Google Wallet"}
        </a>
      )}
    </div>
  );
}
