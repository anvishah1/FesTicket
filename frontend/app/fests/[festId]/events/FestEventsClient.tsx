"use client";

import { useState, useEffect } from "react";
import { FALLBACK_POSTER } from "@/lib/images";
import { useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useApi } from "@/lib/api";

interface Event {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  description: string | null;
  image: string | null;
  category: string | null;
  discount?: number;
  goingCount?: number;
}

export interface FestInfo {
  id: number;
  name: string;
  college: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
];

// Raw event shape from the API (loosely typed; mapEvent normalizes it).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventRaw = any;

function mapEvent(e: any): Event {
  return {
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
    venue: e.venue,
    description: e.shortDescription || e.description || null,
    image: e.image,
    category: e.category,
    discount: e.discount,
    goingCount: e.goingCount,
  };
}

export default function FestEventsClient({
  festId,
  initialFest,
}: {
  festId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialFest: (FestInfo & { events?: any[] }) | null;
}) {
  const router = useRouter();

  const initialEventsRaw = initialFest?.events || [];

  // Filters / query state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sort, setSort] = useState<string>("date");
  const [page, setPage] = useState(1);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever a filter/sort changes.
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, sort]);

  // FE-02: fest info (name/college + the full category list) via SWR, seeded from
  // the SSR payload. The category chips derive from the fest's own events so they
  // stay stable even when the list below is server-filtered.
  const { data: festData, error: festError } = useApi<FestInfo & { events?: EventRaw[] }>(
    Number.isFinite(festId) ? `/api/fests/${festId}` : null,
    initialFest ? { fallbackData: { data: initialFest } } : undefined
  );
  const festInfo: FestInfo | null = festData
    ? { id: festData.id, name: festData.name, college: festData.college }
    : null;
  const categories = ["All", ...Array.from(new Set((festData?.events || []).map((e) => e.category || "Other")))];
  // Loading only while there's no fest data AND no error yet — so a transient
  // failure shows the spinner, not a premature "Fest not found".
  const festLoading = festData === undefined && !festError;

  // FE-02: the filtered / sorted / paginated event list via SWR.
  const qs = new URLSearchParams();
  qs.set("festId", String(festId));
  if (debouncedSearch) qs.set("search", debouncedSearch);
  if (selectedCategory && selectedCategory !== "All") qs.set("category", selectedCategory);
  if (sort) qs.set("sort", sort);
  qs.set("page", String(page));
  const eventsKey = Number.isFinite(festId) ? `/api/events?${qs.toString()}` : null;

  // Seed only the initial view (page 1, date sort, All, no search) from the SSR
  // events; other queries fetch fresh.
  const onInitialEventsKey = !debouncedSearch && selectedCategory === "All" && sort === "date" && page === 1;
  const { data: eventsData, pagination } = useApi<EventRaw[]>(eventsKey, {
    ...(onInitialEventsKey && initialFest
      ? {
          fallbackData: {
            data: initialEventsRaw,
            pagination: {
              page: 1,
              limit: initialEventsRaw.length || 1,
              total: initialEventsRaw.length,
              totalPages: 1,
            },
          },
        }
      : {}),
  });
  const events: Event[] = (eventsData ?? []).map(mapEvent);
  const listLoading = eventsData === undefined;

  const handleEventClick = (eventId: number) => {
    router.push(`/events/${eventId}`);
  };

  if (festLoading) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <p className="text-[#6B597F]">Loading events...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!festInfo) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <p className="text-[#6B597F]">Fest not found</p>
            <button
              onClick={() => router.push("/fests")}
              className="mt-4 text-[#522C5D] hover:underline"
            >
              ← Back to Fests
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total;

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="py-8 px-4">
        {/* Page Title */}
        <div className="max-w-6xl mx-auto mb-6">
          <button
            onClick={() => router.push("/fests")}
            className="text-[#522C5D] hover:underline mb-4 flex items-center gap-1"
          >
            <span>←</span> Back to Fests
          </button>
          <h1 className="text-3xl font-bold text-[#29104A]">{festInfo.name} Events</h1>
          <p className="text-[#6B597F] mt-1">
            Explore all events at {festInfo.name} • {festInfo.college}
          </p>
        </div>

        {/* Search + Sort */}
        <div className="max-w-6xl mx-auto mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by name…"
            aria-label="Search events"
            className="w-full sm:max-w-md rounded-lg border border-[#C5BAC4] bg-white px-4 py-2 text-sm text-[#29104A] placeholder-[#6B597F] focus:border-[#522C5D] focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-[#6B597F]">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort events"
              className="rounded-lg border border-[#C5BAC4] bg-white px-3 py-2 text-sm text-[#29104A] focus:border-[#522C5D] focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Category Filter */}
        <div className="max-w-6xl mx-auto mb-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events by category">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                aria-pressed={selectedCategory === category}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? "bg-[#522C5D] text-white"
                    : "bg-white text-[#6B597F] hover:bg-[#C5BAC4]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Result count */}
        {!listLoading && typeof total === "number" && (
          <div className="max-w-6xl mx-auto mb-4">
            <p className="text-sm text-[#6B597F]" role="status" aria-live="polite">
              {total} {total === 1 ? "event" : "events"} found
            </p>
          </div>
        )}

        {/* Events Grid */}
        <div className="max-w-6xl mx-auto">
          {listLoading ? (
            <p className="text-[#6B597F]">Loading events...</p>
          ) : events.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {events.map((event) => (
                <Card
                  key={event.id}
                  title={event.name}
                  subtitle={event.category || "Event"}
                  description={`${event.startDate ? new Date(event.startDate).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
                  ) : "Date TBA"}${event.venue ? ` • ${event.venue}` : ""}`}
                  image={
                    event.image ||
                    FALLBACK_POSTER
                  }
                  discount={event.discount}
                  going={event.goingCount}
                  hoverText="View Details"
                  onClick={() => handleEventClick(event.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[#6B597F]">
              {debouncedSearch || selectedCategory !== "All"
                ? "No events match your filters."
                : "No events found"}
            </p>
          )}
        </div>

        {/* Pagination */}
        {!listLoading && pagination && totalPages > 1 && (
          <nav
            aria-label="Events pagination"
            className="max-w-6xl mx-auto mt-8 flex items-center justify-center gap-4"
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
              className="rounded-lg border border-[#C5BAC4] bg-white px-4 py-2 text-sm font-medium text-[#522C5D] transition-colors hover:bg-[#C5BAC4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">←</span> Prev
            </button>
            <span className="text-sm text-[#6B597F]" aria-current="page">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
              className="rounded-lg border border-[#C5BAC4] bg-white px-4 py-2 text-sm font-medium text-[#522C5D] transition-colors hover:bg-[#C5BAC4] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <span aria-hidden="true">→</span>
            </button>
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}
