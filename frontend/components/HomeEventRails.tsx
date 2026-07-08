import Link from "next/link";
import { FALLBACK_POSTER } from "@/lib/images";
import Card from "@/components/card";

// SEO-06: server-rendered "Trending now" + "Upcoming" rails for the homepage.
// Pure presentation (the page fetches the data); cards are <Link>-wrapped so the
// event URLs are crawlable and present in view-source. Each rail degrades to a
// friendly CTA when empty.

const FALLBACK_IMG = FALLBACK_POSTER;

interface RailEvent {
  id: number;
  name: string;
  startDate: string | null;
  venue: string | null;
  image: string | null;
  category: string | null;
  discount?: number;
  goingCount?: number;
  festName?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(e: any): RailEvent {
  return {
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    venue: e.venue,
    image: e.image,
    category: e.category,
    discount: e.discount,
    goingCount: e.goingCount,
    festName: e.fest?.name ?? null,
  };
}

function dateVenue(e: RailEvent): string {
  const date = e.startDate
    ? new Date(e.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "Date TBA";
  return `${date}${e.venue ? ` • ${e.venue}` : ""}`;
}

function EventRail({ title, subtitle, events }: { title: string; subtitle: string; events: RailEvent[] }) {
  return (
    <section className="mt-16">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#29104A]">{title}</h2>
          <p className="text-[#6B597F] mt-1">{subtitle}</p>
        </div>
        <Link href="/events" className="shrink-0 text-sm font-medium text-[#522C5D] hover:underline">
          See all →
        </Link>
      </div>
      {events.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
          {events.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="block w-56 shrink-0 snap-start">
              <Card
                title={e.name}
                subtitle={e.category || e.festName || "Event"}
                description={dateVenue(e)}
                image={e.image || FALLBACK_IMG}
                discount={e.discount}
                going={e.goingCount}
                hoverText="View Details"
              />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#C5BAC4] p-8 text-center">
          <p className="text-[#6B597F]">
            No events yet —{" "}
            <Link href="/events" className="font-medium text-[#522C5D] hover:underline">
              explore all events
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}

export default function HomeEventRails({
  trending,
  upcoming,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trending: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcoming: any[];
}) {
  return (
    <>
      <EventRail
        title="Trending now"
        subtitle="The most-booked events on tiqr"
        events={(trending || []).map(mapEvent)}
      />
      <EventRail
        title="Upcoming"
        subtitle="Fresh events, happening soon"
        events={(upcoming || []).map(mapEvent)}
      />
    </>
  );
}
