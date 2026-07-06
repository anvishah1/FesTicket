// frontend/lib/format.ts
//
// FE-13: central currency & locale number formatting.
//
// Money is stored as a Float server-side, so a raw amount can carry float
// artifacts (e.g. 118.00000001). Round to 2 decimals (paise) BEFORE formatting
// so those artifacts never reach the UI. All amounts render with Indian digit
// grouping via Intl (e.g. ₹1,23,456.00).

/**
 * Format a money amount as a localized currency string (default INR, en-IN).
 * NaN / null / undefined are treated as 0.
 */
export function formatCurrency(amount: number, currency: string = "INR"): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  // Round to paise so Float storage artifacts (e.g. ₹118.00000001) never show.
  const rounded = Math.round(safe * 100) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Format an INTEGER PAISE amount (PAY-03) as localized rupees, always 2 decimals
 * (e.g. 12036 -> ₹120.36). This is the canonical money renderer now that the API
 * returns paise everywhere. NaN / null / undefined are treated as 0.
 */
export function formatPaise(paise: number, currency: string = "INR"): string {
  const safe = Number.isFinite(paise) ? paise : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe / 100);
}

/**
 * Format a plain number with Indian digit grouping (e.g. 1,23,456).
 * NaN / null / undefined are treated as 0.
 */
export function formatNumber(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-IN").format(safe);
}
