"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/card";
import { getApiUrl } from "@/lib/auth";

// SEO-07: onward-discovery rails on the event detail page — "More at {fest}" and
// "Similar {category} events". Both come from the public GET /api/events (so only
// PUBLISHED+PUBLIC events surface); the current event is removed and the category
// rail is deduped against the fest rail. Empty rails render nothing.

interface RelatedEvent {
  id: number;
  name: string;
  startDate: string | null;
  venue: string | null;
  image: string | null;
  category: string | null;
  discount?: number;
  goingCount?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(e: any): RelatedEvent {
  return {
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    venue: e.venue,
    image: e.image,
    category: e.category,
    discount: e.discount,
    goingCount: e.goingCount,
  };
}

function Rail({
  title,
  events,
  onOpen,
}: {
  title: string;
  events: RelatedEvent[];
  onOpen: (id: number) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-[#29104A] mb-3">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {events.map((event) => (
          <div key={event.id} className="w-56 shrink-0 snap-start">
            <Card
              title={event.name}
              subtitle={event.category || "Event"}
              description={`${
                event.startDate
                  ? new Date(event.startDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Date TBA"
              }${event.venue ? ` • ${event.venue}` : ""}`}
              image={
                event.image ||
                "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop"
              }
              discount={event.discount}
              going={event.goingCount}
              hoverText="View Details"
              onClick={() => onOpen(event.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RelatedEvents({
  eventId,
  festId,
  festName,
  category,
}: {
  eventId: number;
  festId?: number | null;
  festName?: string | null;
  category?: string | null;
}) {
  const router = useRouter();
  const [festEvents, setFestEvents] = useState<RelatedEvent[]>([]);
  const [categoryEvents, setCategoryEvents] = useState<RelatedEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchList = async (qs: string) => {
      try {
        const res = await fetch(`${getApiUrl()}/api/events?${qs}`);
        const json = await res.json();
        return json?.success && Array.isArray(json.data) ? json.data : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch {
        return [];
      }
    };

    const load = async () => {
      const [festRaw, catRaw] = await Promise.all([
        festId ? fetchList(`festId=${festId}&limit=8`) : Promise.resolve([]),
        category ? fetchList(`category=${encodeURIComponent(category)}&limit=8`) : Promise.resolve([]),
      ]);
      if (cancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fest: RelatedEvent[] = festRaw.filter((e: any) => e.id !== eventId).slice(0, 8).map(mapEvent);
      setFestEvents(fest);

      const festIds = new Set(fest.map((e) => e.id));
      const cat: RelatedEvent[] = catRaw
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((e: any) => e.id !== eventId && !festIds.has(e.id))
        .slice(0, 8)
        .map(mapEvent);
      setCategoryEvents(cat);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, festId, category]);

  if (!festEvents.length && !categoryEvents.length) return null;

  return (
    <section className="max-w-5xl mx-auto w-full px-4 pb-12 space-y-8">
      {festEvents.length > 0 && (
        <Rail
          title={`More at ${festName || "this fest"}`}
          events={festEvents}
          onOpen={(id) => router.push(`/events/${id}`)}
        />
      )}
      {categoryEvents.length > 0 && category && (
        <Rail
          title={`Similar ${category} events`}
          events={categoryEvents}
          onOpen={(id) => router.push(`/events/${id}`)}
        />
      )}
    </section>
  );
}
