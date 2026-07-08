import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverFetch, siteUrl } from "@/lib/serverApi";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/eventJsonLd";
import EventDetailClient, { type EventData } from "./EventDetailClient";

// SEO-01: server-render the event detail page. Fetches on the server, exports
// per-page metadata (title/description/canonical/OG/Twitter), 404s for missing/
// DRAFT/PRIVATE/soft-deleted events, and hands server data to the client island.

// Dynamic (no-store) so notFound() returns a real HTTP 404 for a DRAFT/PRIVATE/
// missing event — an ISR-cached notFound is served as 200. (Route caching is
// revisited in Phase 7 / FE-03.)
async function getEvent(id: string) {
  return serverFetch<EventData>(`/api/events/${encodeURIComponent(id)}`);
}

function metaDescription(e: EventData): string {
  const raw = e.shortDescription || e.description || e.aboutEvent || `${e.name} — book tickets on tiqr.`;
  return String(raw).replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { status, data: event } = await getEvent(id);
  // 404 during the metadata phase commits the status before the stream starts,
  // so notFound() yields a real HTTP 404 (a page-body notFound() streams as 200
  // in Next 16). Still emit noindex as a belt-and-suspenders fallback.
  if (status === 404) notFound();
  if (!event) return { title: "Event", robots: { index: false, follow: false } };

  const canonical = siteUrl(`/events/${event.id}`);
  const title = event.name;
  const description = metaDescription(event);
  // The branded share image comes from the file-based opengraph-image route
  // (SEO-03); Next injects it automatically, so no openGraph.images here.

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, data: event } = await getEvent(id);
  // Genuine not-found (missing / DRAFT / PRIVATE / soft-deleted fest) -> Next 404
  // + noindex, instead of a client "event not found" shell.
  if (status === 404) notFound();
  // A transient failure (5xx / unreachable) renders the island with no server
  // data; it falls back to a client fetch rather than a wrong 404.
  return (
    <>
      {/* SEO-02: schema.org/Event JSON-LD for Google rich results. */}
      {event && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildEventJsonLd(event, siteUrl(`/events/${event.id}`))) }}
        />
      )}
      <EventDetailClient eventId={id} initialEvent={event} />
    </>
  );
}
