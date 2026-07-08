"use client";

import { useEffect, useRef, useState } from "react";
import { formatPaise } from "@/lib/format";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import AddToCalendar from "@/components/AddToCalendar";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";
import dynamic from "next/dynamic";
import Link from "next/link";
import PosterImage from "@/components/PosterImage";
import RelatedEvents from "./RelatedEvents";
import { labelToSlug } from "@/lib/categories";

interface TicketType {
  id: number;
  name: string;
  price: number;
  quantity: number;
  sold: number;
  description?: string | null;
}

export interface EventData {
  id: number;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  aboutEvent?: string | null;
  audience?: string | null;
  image?: string | null;
  category?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  venue?: string | null;
  venueAddress?: string | null;
  discount?: number;
  goingCount?: number;
  status?: string;
  effectiveStatus?: string;
  festId?: number | null;
  fest?: {
    name: string;
    college: string;
  } | null;
  ticketTypes: TicketType[];
}

// Geocode results are cached in localStorage keyed by the venue string so repeat
// views of the same event don't re-hit Nominatim. Entries older than TTL_MS are
// treated as stale and refetched. A resolved miss (coords: null) is cached too.
const GEOCODE_CACHE_PREFIX = "geocode:";
const GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type GeoCoords = { lat: number; lng: number } | null;

function readGeocodeCache(addr: string): { hit: boolean; coords: GeoCoords } {
  if (typeof window === "undefined") return { hit: false, coords: null };
  try {
    const raw = window.localStorage.getItem(GEOCODE_CACHE_PREFIX + addr);
    if (!raw) return { hit: false, coords: null };
    const parsed = JSON.parse(raw) as { ts: number; coords: GeoCoords };
    if (!parsed || typeof parsed.ts !== "number") return { hit: false, coords: null };
    if (Date.now() - parsed.ts > GEOCODE_TTL_MS) return { hit: false, coords: null };
    return { hit: true, coords: parsed.coords ?? null };
  } catch {
    return { hit: false, coords: null };
  }
}

function writeGeocodeCache(addr: string, coords: GeoCoords) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GEOCODE_CACHE_PREFIX + addr,
      JSON.stringify({ ts: Date.now(), coords })
    );
  } catch {
    /* quota / disabled storage — geocoding simply won't be cached */
  }
}

// Dynamically import React Leaflet components on client only
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);

export default function EventDetailClient({
  eventId,
  initialEvent,
}: {
  eventId: string;
  initialEvent: EventData | null;
}) {
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(initialEvent);
  const [loading, setLoading] = useState(!initialEvent);
  // Distinguish a transient failure (network / 5xx) from a genuine not-found so
  // an error never masquerades as "event not found".
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  // Skip the client re-fetch on first mount when the server already provided data.
  const didInit = useRef(false);

  // Resolve a venue address to map coordinates (localStorage-cached). Shared by
  // the client re-fetch and the first-mount server-data path.
  const geocodeVenue = (addr?: string | null) => {
    if (!addr) return;
    const cached = readGeocodeCache(addr);
    if (cached.hit) {
      setCoords(cached.coords);
      return;
    }
    setGeocoding(true);
    const query = encodeURIComponent(addr);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`)
      .then((res) => res.json())
      .then((results) => {
        let resolved: GeoCoords = null;
        if (Array.isArray(results) && results.length > 0) {
          const first = results[0];
          const lat = parseFloat(first.lat);
          const lng = parseFloat(first.lon);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) resolved = { lat, lng };
        }
        setCoords(resolved);
        writeGeocodeCache(addr, resolved);
      })
      .catch((err) => console.error("Geocoding failed:", err))
      .finally(() => setGeocoding(false));
  };

  useEffect(() => {
    const fetchEvent = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`${getApiUrl()}/api/events/${eventId}`);
        // A 404 is a genuine not-found; other non-ok statuses are real errors.
        if (res.status === 404) {
          setEvent(null);
          return;
        }
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data = await res.json();
        if (data.success && data.data) {
          setEvent(data.data);
          // Geocode the venue, but serve from the localStorage cache first so
          // repeat views of the same venue don't re-hit Nominatim.
          geocodeVenue(data.data.venueAddress || data.data.venue);
        } else {
          // Successful HTTP but no event payload — treat as not found.
          setEvent(null);
        }
      } catch (err) {
        console.error("Failed to fetch event details:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (!didInit.current && initialEvent) {
      // First mount with server-provided data: don't refetch, just geocode.
      didInit.current = true;
      geocodeVenue(initialEvent.venueAddress || initialEvent.venue);
      return;
    }
    didInit.current = true;
    fetchEvent();
  }, [eventId, reloadKey]);

  const formatDateRange = (start?: string | null, end?: string | null) => {
    if (!start) return "Date TBA";
    const startDate = new Date(start);
    if (!end) {
      return startDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} – ${endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[#C5BAC4]/40 rounded w-1/3" />
            <div className="h-64 bg-[#C5BAC4]/40 rounded" />
            <div className="h-32 bg-[#C5BAC4]/30 rounded" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10 text-center" role="alert">
          <h1 className="text-2xl font-bold text-[#29104A]">
            Couldn&apos;t load this event
          </h1>
          <p className="mt-2 text-sm text-[#6B597F]">
            Something went wrong. Please check your connection and try again.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-lg bg-[#522C5D] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#29104A]"
            >
              Try again
            </button>
            <button
              onClick={() => router.push("/fests")}
              className="text-[#522C5D] hover:underline"
            >
              ← Back to events
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10 text-center">
          <h1 className="text-2xl font-bold text-[#29104A]">Event not found</h1>
          <button
            onClick={() => router.push("/fests")}
            className="mt-4 text-[#522C5D] hover:underline"
          >
            ← Back to events
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const primaryDescription =
    event.description || event.shortDescription || event.aboutEvent || "No description provided yet.";

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8 grid gap-8 lg:grid-cols-[2fr,1fr]">
        {/* Left: details */}
        <section className="space-y-6">
          {/* Hero */}
          <div className="overflow-hidden rounded-2xl border border-[#C5BAC4] bg-white">
            {event.image && (
              <div className="relative h-64 w-full overflow-hidden">
                <PosterImage
                  src={event.image}
                  alt={`Poster for ${event.name}`}
                  priority
                  sizes="(max-width:1024px) 100vw, 66vw"
                  className="object-cover"
                />
              </div>
            )}

            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#29104A]">{event.name}</h1>
                  {event.fest && (
                    <p className="text-sm text-[#6B597F] mt-1">
                      Part of <span className="font-medium">{event.fest.name}</span> •{" "}
                      {event.fest.college}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {typeof event.discount === "number" && event.discount > 0 && (
                    <span
                      data-testid="discount-badge"
                      className="inline-flex items-center rounded-full bg-[#E11D48] px-3 py-1 text-xs font-bold text-white"
                    >
                      {event.discount}% OFF
                    </span>
                  )}
                  {/* SEO-10: link the category badge to its landing page */}
                  {event.category &&
                    (labelToSlug(event.category) ? (
                      <Link
                        href={`/events/category/${labelToSlug(event.category)}`}
                        className="inline-flex items-center rounded-full bg-[#522C5D]/10 px-3 py-1 text-xs font-medium text-[#522C5D] transition-colors hover:bg-[#522C5D]/20"
                      >
                        {event.category}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[#522C5D]/10 px-3 py-1 text-xs font-medium text-[#522C5D]">
                        {event.category}
                      </span>
                    ))}
                  {/* SEO-08: "N going" social proof — COMPLETED bookings only */}
                  {typeof event.goingCount === "number" && event.goingCount > 0 && (
                    <span
                      data-testid="going-badge"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#522C5D]/10 px-3 py-1 text-xs font-medium text-[#522C5D]"
                    >
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {event.goingCount} going
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-[#6B597F]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#29104A]">When:</span>
                  <span>{formatDateRange(event.startDate, event.endDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#29104A]">Where:</span>
                  <span>{event.venue || "Venue TBA"}</span>
                </div>
                {/* TIX-09 */}
                {event.startDate && (
                  <AddToCalendar
                    eventId={Number(eventId)}
                    name={event.name}
                    startDate={event.startDate}
                    startTime={event.startTime}
                    endDate={event.endDate}
                    venue={event.venue}
                    description={event.description}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-[#C5BAC4] bg-white p-6 space-y-3">
            <h2 className="text-lg font-semibold text-[#29104A]">About this event</h2>
            <p className="text-sm leading-relaxed text-[#4B3F60] whitespace-pre-line">
              {primaryDescription}
            </p>
            {event.audience && (
              <p className="text-sm text-[#6B597F]">
                <span className="font-medium text-[#29104A]">Who should attend:</span>{" "}
                {event.audience}
              </p>
            )}
          </div>

          {/* Venue details + map */}
          {(event.venueAddress || event.venue) && (
            <div className="rounded-2xl border border-[#C5BAC4] bg-white p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#29104A]">Venue details</h3>
                <p className="text-sm text-[#4B3F60]">
                  {event.venueAddress || event.venue}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[#6B597F]">Location on map</p>
                <div className="h-64 w-full overflow-hidden rounded-xl border border-[#C5BAC4]/80 bg-[#f3eef7]">
                  {coords ? (
                    <MapContainer
                      center={[coords.lat, coords.lng]}
                      zoom={16}
                      scrollWheelZoom={false}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker position={[coords.lat, coords.lng]} />
                    </MapContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[#6B597F] px-4 text-center">
                      {geocoding
                        ? "Loading map for this venue…"
                        : "We couldn't place this venue on the map automatically, but you can still find it using the address above."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right: tickets & CTA */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#C5BAC4] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#29104A] mb-3">Tickets</h2>

            {event.ticketTypes.length === 0 ? (
              <p className="text-sm text-[#6B597F]">Tickets are not available yet. Check back soon.</p>
            ) : (
              <ul className="space-y-3">
                {event.ticketTypes.map((t) => {
                  const available = t.quantity - t.sold;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-xl border border-[#C5BAC4] px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#29104A]">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-[#6B597F] mt-0.5 line-clamp-2">{t.description}</p>
                        )}
                        <p className="text-xs text-[#6B597F] mt-1">
                          {available > 0 ? `${available} tickets left` : "Sold out"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-[#29104A]">
                          <span className="sr-only">Price: </span>{formatPaise(t.price)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {(() => {
              const isCancelled = event.status === "CANCELLED";
              const isPast = event.effectiveStatus === "PAST";
              const isSoldOut =
                event.ticketTypes.length > 0 &&
                event.ticketTypes.every((t) => t.quantity - t.sold <= 0);
              const disabled = isCancelled || isPast || isSoldOut;
              const label = isCancelled
                ? "Cancelled"
                : isPast
                ? "Event ended"
                : isSoldOut
                ? "Sold out"
                : "Book tickets";
              return (
                <button
                  onClick={() => router.push(`/events/${eventId}/booking`)}
                  disabled={disabled}
                  className={`mt-5 w-full rounded-lg py-3 text-sm font-semibold text-white transition-colors ${
                    disabled
                      ? "cursor-not-allowed bg-[#C5BAC4]"
                      : "bg-[#522C5D] hover:bg-[#29104A]"
                  }`}
                >
                  {label}
                </button>
              );
            })()}
          </div>
        </aside>
      </main>

      {/* SEO-07: onward-discovery rails (more-at-fest + similar-category) */}
      <RelatedEvents
        eventId={event.id}
        festId={event.festId}
        festName={event.fest?.name}
        category={event.category}
      />

      <Footer />
    </div>
  );
}

