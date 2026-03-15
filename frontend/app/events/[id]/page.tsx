"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";
import dynamic from "next/dynamic";

interface TicketType {
  id: number;
  name: string;
  price: number;
  quantity: number;
  sold: number;
  description?: string | null;
}

interface EventData {
  id: number;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  aboutEvent?: string | null;
  image?: string | null;
  category?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  venue?: string | null;
  venueAddress?: string | null;
  fest?: {
    name: string;
    college: string;
  } | null;
  ticketTypes: TicketType[];
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

export default function EventDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/events/${eventId}`);
        const data = await res.json();
        if (data.success && data.data) {
          setEvent(data.data);
          // Kick off geocoding based on venue address, if available
          const addr = data.data.venueAddress || data.data.venue;
          if (addr) {
            setGeocoding(true);
            const query = encodeURIComponent(addr);
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`)
              .then((res) => res.json())
              .then((results) => {
                if (Array.isArray(results) && results.length > 0) {
                  const first = results[0];
                  const lat = parseFloat(first.lat);
                  const lng = parseFloat(first.lon);
                  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                    setCoords({ lat, lng });
                  }
                }
              })
              .catch((err) => {
                console.error("Geocoding failed:", err);
              })
              .finally(() => setGeocoding(false));
          }
        }
      } catch (err) {
        console.error("Failed to fetch event details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

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
              <div className="h-64 w-full overflow-hidden">
                <img
                  src={event.image}
                  alt={event.name}
                  className="h-full w-full object-cover"
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
                {event.category && (
                  <span className="inline-flex items-center rounded-full bg-[#522C5D]/10 px-3 py-1 text-xs font-medium text-[#522C5D]">
                    {event.category}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-[#6B597F]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#29104A]">When:</span>
                  <span>{formatDateRange(event.startDate, event.endDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#29104A]">Where:</span>
                  <span>{event.venue || "Venue TBA"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-[#C5BAC4] bg-white p-6 space-y-3">
            <h2 className="text-lg font-semibold text-[#29104A]">About this event</h2>
            <p className="text-sm leading-relaxed text-[#4B3F60] whitespace-pre-line">
              {primaryDescription}
            </p>
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
              <div className="space-y-3">
                {event.ticketTypes.map((t) => {
                  const available = t.quantity - t.sold;
                  return (
                    <div
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
                        <p className="text-base font-bold text-[#29104A]">₹{t.price}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => router.push(`/events/${eventId}/booking`)}
              className="mt-5 w-full rounded-lg bg-[#522C5D] py-3 text-sm font-semibold text-white hover:bg-[#29104A] transition-colors"
            >
              Book tickets
            </button>
          </div>
        </aside>
      </main>

      <Footer />
    </div>
  );
}

