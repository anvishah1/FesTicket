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
  latitude?: number | null;
  longitude?: number | null;
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

// FE-04: the whole Leaflet map (+ its CSS) is one client-only chunk, loaded only
// when this detail page renders a map — not shipped to every route.
const EventMap = dynamic(() => import("@/components/EventMap"), { ssr: false });

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

  // FE-06: prefer server-stored coordinates (geocoded once at save time); fall back
  // to the client geocode only when they are absent.
  const applyEventCoords = (e: EventData) => {
    if (typeof e.latitude === "number" && typeof e.longitude === "number") {
      setCoords({ lat: e.latitude, lng: e.longitude });
    } else {
      geocodeVenue(e.venueAddress || e.venue);
    }
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
          // Use stored coords when present; else client-geocode (cached) as fallback.
          applyEventCoords(data.data);
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
      // First mount with server-provided data: don't refetch, just place the map.
      didInit.current = true;
      applyEventCoords(initialEvent);
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
      <div className="min-h-screen bg-[var(--surface-tint)]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[color-mix(in_srgb,var(--surface-card)_40%,transparent)] rounded w-1/3" />
            <div className="h-64 bg-[color-mix(in_srgb,var(--surface-card)_40%,transparent)] rounded" />
            <div className="h-32 bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] rounded" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--surface-tint)]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10 text-center" role="alert">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Couldn&apos;t load this event
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Something went wrong. Please check your connection and try again.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-lg bg-[var(--fill-plum)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--fill-ink)]"
            >
              Try again
            </button>
            <button
              onClick={() => router.push("/fests")}
              className="text-[var(--text-secondary)] hover:underline"
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
      <div className="min-h-screen bg-[var(--surface-tint)]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-10 text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Event not found</h1>
          <button
            onClick={() => router.push("/fests")}
            className="mt-4 text-[var(--text-secondary)] hover:underline"
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
    <div className="min-h-screen bg-[var(--surface-tint)]">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8 grid gap-8 lg:grid-cols-[2fr,1fr]">
        {/* Left: details */}
        <section className="space-y-6">
          {/* Hero. NOT `overflow-hidden`: it used to be, which clipped the
              Add-to-calendar dropdown inside it to nothing. The banner image is the
              only thing that needs clipping, so it rounds its own top corners. */}
          <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--surface)]">
            {event.image && (
              <div className="relative h-64 w-full overflow-hidden rounded-t-2xl">
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
                  <h1 className="text-2xl font-bold text-[var(--text-primary)]">{event.name}</h1>
                  {event.fest && (
                    <p className="text-sm text-[var(--text-muted)] mt-1">
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
                        className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--fill-plum)_20%,transparent)]"
                      >
                        {event.category}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        {event.category}
                      </span>
                    ))}
                  {/* SEO-08: "N going" social proof — COMPLETED bookings only */}
                  {typeof event.goingCount === "number" && event.goingCount > 0 && (
                    <span
                      data-testid="going-badge"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {event.goingCount} going
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-primary)]">When:</span>
                  <span>{formatDateRange(event.startDate, event.endDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-primary)]">Where:</span>
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
          <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--surface)] p-6 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">About this event</h2>
            <p className="text-sm leading-relaxed text-[var(--text-muted)] whitespace-pre-line">
              {primaryDescription}
            </p>
            {event.audience && (
              <p className="text-sm text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-primary)]">Who should attend:</span>{" "}
                {event.audience}
              </p>
            )}
          </div>

          {/* Venue details + map */}
          {(event.venueAddress || event.venue) && (
            <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--surface)] p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Venue details</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {event.venueAddress || event.venue}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Location on map</p>
                <div className="h-64 w-full overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--border-card)_80%,transparent)] bg-[var(--surface-tint)]">
                  {coords ? (
                    <EventMap lat={coords.lat} lng={coords.lng} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)] px-4 text-center">
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
          <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Tickets</h2>

            {event.ticketTypes.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Tickets are not available yet. Check back soon.</p>
            ) : (
              <ul className="space-y-3">
                {event.ticketTypes.map((t) => {
                  const available = t.quantity - t.sold;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--border-card)] px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{t.description}</p>
                        )}
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {available > 0 ? `${available} tickets left` : "Sold out"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-[var(--text-primary)]">
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
                      ? "cursor-not-allowed bg-[var(--surface-card)]"
                      : "bg-[var(--fill-plum)] hover:bg-[var(--fill-ink)]"
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

