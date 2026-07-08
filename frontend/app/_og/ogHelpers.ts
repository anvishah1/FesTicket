/* eslint-disable @typescript-eslint/no-explicit-any */
// frontend/app/_og/ogHelpers.ts
//
// Pure/data helpers for the OpenGraph share cards, split out of ogCard.tsx so they
// can be unit-tested without importing next/og (which pulls in WASM). ogCard.tsx
// re-exports these for the image routes.

// SSRF guard: the OG route server-fetches a HOST-CONTROLLED image URL, so an
// attacker could point event.image at an internal target (cloud metadata, a
// service on localhost/RFC1918) to probe or trigger it. Only allow http(s) to a
// PUBLIC host — reject loopback/link-local/private-range literals and internal
// hostnames. (Residual: this does not stop DNS-rebinding or a public host that
// 302-redirects to an internal one; the direct-URL vector is closed.)
export function isPublicHttpUrl(raw?: string | null): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return false;
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // loopback 127/8, "this host" 0/8, RFC1918 10/8 & 192.168/16 & 172.16-31,
    // link-local (incl. AWS/GCP metadata 169.254.169.254) 169.254/16.
    if (a === 0 || a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) {
      return false;
    }
  }
  return true;
}

// Only an absolute PUBLIC http(s) image is usable; a data:/relative /uploads path
// has no origin ImageResponse can resolve, and an internal URL is an SSRF target.
// Fetch it ourselves (short timeout) and inline it as a data URI so a slow/broken
// remote host degrades to the gradient instead of throwing inside satori. Returns
// null on any failure.
export async function fetchPoster(image?: string | null): Promise<string | null> {
  if (!isPublicHttpUrl(image)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    // redirect: "error" — don't follow a 3xx to a (possibly internal) location.
    const res = await fetch(image as string, { signal: ctrl.signal, headers: { Accept: "image/*" }, redirect: "error" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5_000_000) return null; // guard empty / huge
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatDateRange(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  const sd = new Date(start);
  if (Number.isNaN(sd.getTime())) return null;
  const full = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (!end) return full(sd);
  const ed = new Date(end);
  // Same-day comparison must also be in UTC (consistent with the display) so a
  // range that spans a single UTC day collapses regardless of the runtime tz.
  const sameUtcDay =
    sd.getUTCFullYear() === ed.getUTCFullYear() &&
    sd.getUTCMonth() === ed.getUTCMonth() &&
    sd.getUTCDate() === ed.getUTCDate();
  if (Number.isNaN(ed.getTime()) || sameUtcDay) return full(sd);
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${short(sd)} – ${full(ed)}`;
}

// "from ₹200" / "Free" / null. Money is INTEGER PAISE (PAY-03).
export function priceChip(ticketTypes?: any[]): string | null {
  const prices = (Array.isArray(ticketTypes) ? ticketTypes : [])
    .map((t) => t?.price)
    .filter((p) => typeof p === "number");
  if (!prices.length) return null;
  const min = Math.min(...prices);
  if (min <= 0) return "Free";
  // FLOOR to whole rupees so a "from ₹X" chip never overstates the cheapest price
  // (e.g. 19950 paise -> "from ₹199", not a rounded-up "₹200").
  return `from ₹${Math.floor(min / 100).toLocaleString("en-IN")}`;
}
