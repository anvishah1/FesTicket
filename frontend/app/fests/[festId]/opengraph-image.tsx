/* eslint-disable @typescript-eslint/no-explicit-any */
// SEO-03: dynamic 1200x630 OpenGraph share card for a fest. Server-fetches the
// public fest (missing/soft-deleted -> 404 -> generic branded fallback) and
// composes a card with the fest name, college, date range and a cheapest-ticket
// price chip drawn across the fest's published events.

import { serverFetch } from "@/lib/serverApi";
import { renderCard, fetchPoster, formatDateRange, priceChip, size, contentType } from "../../_og/ogCard";

export const runtime = "nodejs";
export const alt = "Fest on FesTicket";
export { size, contentType };

export default async function Image({ params }: { params: Promise<{ festId: string }> }) {
  const { festId } = await params;
  try {
    const { status, data: f } = await serverFetch<any>(`/api/fests/${encodeURIComponent(festId)}`);
    if (status !== 200 || !f) {
      return renderCard({ eyebrow: "Fest", title: "FesTicket", subtitle: "Discover & book college-fest events" });
    }
    // Cheapest ticket across all of the fest's published events.
    const allTickets = (Array.isArray(f.events) ? f.events : []).flatMap((e: any) =>
      Array.isArray(e?.ticketTypes) ? e.ticketTypes : []
    );
    const poster = await fetchPoster(f.image);
    return renderCard({
      eyebrow: "Fest",
      title: f.name || "Fest",
      subtitle: formatDateRange(f.startDate, f.endDate),
      meta: f.college || null,
      chip: priceChip(allTickets),
      poster,
    });
  } catch {
    return renderCard({ eyebrow: "Fest", title: "FesTicket", subtitle: "Discover & book college-fest events" });
  }
}
