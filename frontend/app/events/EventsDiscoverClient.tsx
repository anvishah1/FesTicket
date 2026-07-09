"use client";

import { useState, useEffect, useRef } from "react";
import { FALLBACK_POSTER } from "@/lib/images";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import { getApiUrl } from "@/lib/auth";
import { CATEGORY_LABELS } from "@/lib/categories";

// SEO-05: global cross-fest event discovery with faceted filters. The server
// page seeds the first page; this island owns the facets and refetches. Reused by
// the SEO-10 category landing pages via `lockedCategory` (hides the category
// facet and pins results to one category).

interface EventItem {
  id: number;
  name: string;
  startDate: string | null;
  venue: string | null;
  description: string | null;
  image: string | null;
  category: string | null;
  discount?: number;
  goingCount?: number;
  festName?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const SORT_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "trending", label: "Trending" },
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(e: any): EventItem {
  return {
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    venue: e.venue,
    description: e.shortDescription || e.description || null,
    image: e.image,
    category: e.category,
    discount: e.discount,
    goingCount: e.goingCount,
    festName: e.fest?.name ?? null,
  };
}

export default function EventsDiscoverClient({
  initialEvents,
  initialPagination,
  lockedCategory,
}: {
  // null => the server render failed (transient outage); the island refetches on
  // mount rather than showing a sticky "No events". [] => a genuine empty result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialEvents: any[] | null;
  initialPagination: Pagination | null;
  lockedCategory?: string;
}) {
  const [events, setEvents] = useState<EventItem[]>((initialEvents || []).map(mapEvent));
  const [pagination, setPagination] = useState<Pagination | null>(initialPagination);
  const [loading, setLoading] = useState(initialEvents == null);
  const didInit = useRef(false);

  // Facet state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [college, setCollege] = useState("");
  const [debouncedCollege, setDebouncedCollege] = useState("");
  const [sort, setSort] = useState("date");
  const [page, setPage] = useState(1);

  // Debounce the free-text inputs.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedCollege(college);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search, college]);

  // Reset to page 1 whenever a non-text facet changes.
  useEffect(() => {
    setPage(1);
  }, [category, dateFrom, dateTo, onlineOnly, freeOnly, sort]);

  useEffect(() => {
    // Skip the first fetch when the server provided the initial page (incl. a
    // genuine empty []). If initialEvents is null (failed SSR render), fall
    // through and fetch on mount to recover.
    if (!didInit.current && initialEvents) {
      didInit.current = true;
      return;
    }
    didInit.current = true;

    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("page", String(page));
        if (debouncedSearch) qs.set("search", debouncedSearch);
        const activeCategory = lockedCategory || (category !== "All" ? category : "");
        if (activeCategory) qs.set("category", activeCategory);
        if (sort) qs.set("sort", sort);
        if (dateFrom) qs.set("dateFrom", dateFrom);
        if (dateTo) qs.set("dateTo", dateTo);
        if (onlineOnly) qs.set("isOnline", "true");
        if (freeOnly) qs.set("free", "true");
        if (debouncedCollege) qs.set("college", debouncedCollege);

        const res = await fetch(`${getApiUrl()}/api/events?${qs.toString()}`, { signal: controller.signal });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setEvents(json.data.map(mapEvent));
          setPagination(json.pagination ?? null);
        } else {
          setEvents([]);
          setPagination(null);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Failed to load events:", err);
          setEvents([]);
          setPagination(null);
        }
      } finally {
        setLoading(false);
      }
    };
    run();
    return () => controller.abort();
    // lockedCategory is stable for a given page mount.
  }, [
    page,
    debouncedSearch,
    debouncedCollege,
    category,
    dateFrom,
    dateTo,
    onlineOnly,
    freeOnly,
    sort,
    lockedCategory,
    initialEvents,
  ]);

  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total;

  const hasActiveFilters =
    !!debouncedSearch ||
    (!lockedCategory && category !== "All") ||
    !!dateFrom ||
    !!dateTo ||
    onlineOnly ||
    freeOnly ||
    !!debouncedCollege;

  const clearFilters = () => {
    setSearch("");
    setCollege("");
    setCategory("All");
    setDateFrom("");
    setDateTo("");
    setOnlineOnly(false);
    setFreeOnly(false);
    setSort("date");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-[#29104A]">
            {lockedCategory ? `${lockedCategory} Events` : "Discover Events"}
          </h1>
          <p className="text-[#6B597F] mt-1">
            {lockedCategory
              ? `Browse ${lockedCategory.toLowerCase()} events across every fest on tiqr.`
              : "Browse and book tickets for events across every fest on tiqr."}
          </p>
        </div>

        <div className="max-w-6xl mx-auto mt-6 flex flex-col gap-6 lg:flex-row">
          {/* Facet sidebar */}
          <aside className="w-full lg:w-64 lg:shrink-0">
            <div className="rounded-xl border border-[#C5BAC4] bg-white p-4 space-y-5">
              <div>
                <label htmlFor="q" className="block text-xs font-semibold uppercase tracking-wide text-[#6B597F] mb-1">
                  Search
                </label>
                <input
                  id="q"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Event name…"
                  className="w-full rounded-lg border border-[#C5BAC4] bg-white px-3 py-2 text-sm text-[#29104A] placeholder-[#6B597F] focus:border-[#522C5D] focus:outline-none"
                />
              </div>

              {!lockedCategory && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6B597F] mb-2">Category</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                    {["All", ...CATEGORY_LABELS].map((c) => (
                      <button
                        key={c}
                        onClick={() => setCategory(c)}
                        aria-pressed={category === c}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          category === c ? "bg-[#522C5D] text-white" : "bg-[#F3EFF6] text-[#6B597F] hover:bg-[#C5BAC4]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B597F] mb-2">Date range</p>
                <div className="flex flex-col gap-2">
                  <input
                    type="date"
                    aria-label="From date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-[#C5BAC4] bg-white px-3 py-2 text-sm text-[#29104A] focus:border-[#522C5D] focus:outline-none"
                  />
                  <input
                    type="date"
                    aria-label="To date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-[#C5BAC4] bg-white px-3 py-2 text-sm text-[#29104A] focus:border-[#522C5D] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="college" className="block text-xs font-semibold uppercase tracking-wide text-[#6B597F] mb-1">
                  City / College
                </label>
                <input
                  id="college"
                  type="text"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  placeholder="e.g. IIT Bombay"
                  className="w-full rounded-lg border border-[#C5BAC4] bg-white px-3 py-2 text-sm text-[#29104A] placeholder-[#6B597F] focus:border-[#522C5D] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-[#29104A]">
                  <input
                    type="checkbox"
                    checked={onlineOnly}
                    onChange={(e) => setOnlineOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-[#C5BAC4] text-[#522C5D] focus:ring-[#522C5D]"
                  />
                  Online only
                </label>
                <label className="flex items-center gap-2 text-sm text-[#29104A]">
                  <input
                    type="checkbox"
                    checked={freeOnly}
                    onChange={(e) => setFreeOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-[#C5BAC4] text-[#522C5D] focus:ring-[#522C5D]"
                  />
                  Free only
                </label>
              </div>

              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-sm text-[#522C5D] hover:underline">
                  Clear all filters
                </button>
              )}
            </div>
          </aside>

          {/* Results */}
          <section className="flex-1">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {!loading && typeof total === "number" ? (
                <p className="text-sm text-[#6B597F]" role="status" aria-live="polite">
                  {total} {total === 1 ? "event" : "events"} found
                </p>
              ) : (
                <span />
              )}
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

            {loading ? (
              <CardGridSkeleton />
            ) : events.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {events.map((event) => (
                  <Card
                    key={event.id}
                    title={event.name}
                    subtitle={event.category || event.festName || "Event"}
                    description={`${
                      event.startDate
                        ? new Date(event.startDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })
                        : "Date TBA"
                    }${event.venue ? ` • ${event.venue}` : ""}`}
                    image={
                      event.image ||
                      FALLBACK_POSTER
                    }
                    discount={event.discount}
                    going={event.goingCount}
                    hoverText="View Details"
                    href={`/events/${event.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#C5BAC4] p-10 text-center">
                <p className="text-[#29104A] font-medium">No events match your filters.</p>
                <p className="text-sm text-[#6B597F] mt-1">Try widening your date range or clearing a filter.</p>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="mt-4 text-sm text-[#522C5D] hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {!loading && pagination && totalPages > 1 && (
              <nav aria-label="Events pagination" className="mt-8 flex items-center justify-center gap-4">
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
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
