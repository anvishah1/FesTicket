/* eslint-disable @typescript-eslint/no-explicit-any */
// SEO-03: dynamic 1200x630 OpenGraph share card for an event. Server-fetches the
// public event (DRAFT/PRIVATE/missing -> 404 -> generic branded fallback, so a
// private name never leaks) and composes the poster/gradient card. Node runtime
// so it can reach the backend and read the bundled font.

import { serverFetch } from "@/lib/serverApi";
import { renderCard, fetchPoster, formatDateRange, priceChip, size, contentType } from "../../_og/ogCard";

export const runtime = "nodejs";
export const alt = "Event on FesTicket";
export { size, contentType };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { status, data: e } = await serverFetch<any>(`/api/events/${encodeURIComponent(id)}`);
    if (status !== 200 || !e) {
      return renderCard({ eyebrow: "Event", title: "FesTicket", subtitle: "Discover & book college-fest events" });
    }
    const poster = await fetchPoster(e.image);
    return renderCard({
      eyebrow: e.fest?.name || "Event",
      title: e.name || "Event",
      subtitle: formatDateRange(e.startDate, e.endDate),
      meta: e.isOnline ? "Online" : e.venue || null,
      chip: priceChip(e.ticketTypes),
      poster,
    });
  } catch {
    return renderCard({ eyebrow: "Event", title: "FesTicket", subtitle: "Discover & book college-fest events" });
  }
}
