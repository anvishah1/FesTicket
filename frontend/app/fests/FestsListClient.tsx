"use client";

import { useState, useEffect } from "react";
import { FALLBACK_POSTER } from "@/lib/images";
import { useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useApi } from "@/lib/api";

export interface Fest {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  college: string;
  description: string | null;
  image: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function FestsListClient({
  initialFests,
  initialPagination,
}: {
  // null => the server render failed (transient outage); the island refetches on
  // mount instead of showing a sticky "No fests". [] => a genuine empty result.
  initialFests: Fest[] | null;
  initialPagination: Pagination | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce the search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // any new query resets to the first page
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // FE-02: SWR-backed fetch. The key encodes the query, so search/page changes
  // refetch (and dedup) automatically — no manual loading/error/reload bookkeeping.
  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  params.set("page", String(page));
  const key = `/api/fests?${params.toString()}`;

  // Seed ONLY the initial key (page 1, no search) from the SSR payload. A null
  // seed (failed server render) leaves fallbackData unset so SWR fetches on mount.
  const onInitialKey = !debouncedSearch && page === 1;
  const { data, pagination, error, isLoading, mutate } = useApi<Fest[]>(key, {
    ...(onInitialKey && initialFests != null
      ? { fallbackData: { data: initialFests, pagination: initialPagination ?? undefined } }
      : {}),
  });

  const fests = data ?? [];
  // Show the loading state only when there's genuinely nothing to display yet —
  // SWR's isLoading stays true during background revalidation even with seeded
  // fallbackData, which would flash "Loading" over the seed. `data === undefined`
  // is true only on a real first load with no seed/cache (the null-recovery path).
  const loading = data === undefined && isLoading;

  const formatDate = (startDate: string | null, endDate: string | null) => {
    if (!startDate) return "Date TBA";
    const start = new Date(startDate);
    // timeZone: "UTC" so the SSR (server tz) and client (user tz) render the same
    // calendar day for a midnight-UTC/date-only value — no hydration mismatch.
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
    if (endDate) {
      const end = new Date(endDate);
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} - ${end.toLocaleDateString("en-US", options)}`;
    }
    return start.toLocaleDateString("en-US", options);
  };

  const handleFestClick = (festId: number) => {
    router.push(`/fests/${festId}/events`);
  };

  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total;

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="py-8 px-4">
        {/* Page Title */}
        <div className="max-w-6xl mx-auto mb-6">
          <h1 className="text-3xl font-bold text-[#29104A]">Discover Fests</h1>
          <p className="text-[#6B597F] mt-1">
            Explore the most exciting college festivals across India
          </p>
        </div>

        {/* Search */}
        <div className="max-w-6xl mx-auto mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fests by name…"
            aria-label="Search fests"
            className="w-full sm:max-w-md rounded-lg border border-[#C5BAC4] bg-white px-4 py-2 text-sm text-[#29104A] placeholder-[#6B597F] focus:border-[#522C5D] focus:outline-none"
          />
          {!loading && !error && typeof total === "number" && (
            <p className="mt-2 text-sm text-[#6B597F]" role="status" aria-live="polite">
              {total} {total === 1 ? "fest" : "fests"} found
              {debouncedSearch ? ` for “${debouncedSearch}”` : ""}
            </p>
          )}
        </div>

        {/* Cards Grid */}
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <p className="text-[#6B597F]">Loading fests...</p>
          ) : error ? (
            <div role="alert" className="text-[#6B597F]">
              <p>Something went wrong while loading fests. Please check your connection and try again.</p>
              <button
                onClick={() => mutate()}
                className="mt-3 rounded-lg border border-[#C5BAC4] bg-white px-4 py-2 text-sm font-medium text-[#522C5D] transition-colors hover:bg-[#C5BAC4]"
              >
                Try again
              </button>
            </div>
          ) : fests.length === 0 ? (
            <p className="text-[#6B597F]">
              {debouncedSearch ? `No fests match “${debouncedSearch}”.` : "No fests found"}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {fests.map((fest) => (
                <Card
                  key={fest.id}
                  title={fest.name}
                  subtitle={fest.college}
                  description={formatDate(fest.startDate, fest.endDate)}
                  image={fest.image || FALLBACK_POSTER}
                  onClick={() => handleFestClick(fest.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && pagination && totalPages > 1 && (
          <nav
            aria-label="Fests pagination"
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
