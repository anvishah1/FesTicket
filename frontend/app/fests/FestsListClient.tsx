"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

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
  const [fests, setFests] = useState<Fest[]>(initialFests || []);
  const [loading, setLoading] = useState(initialFests == null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(initialPagination);
  const didInit = useRef(false);
  // Track a genuine fetch failure (network error / non-ok / unsuccessful body)
  // separately from an empty-but-successful result so the two don't look alike.
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // any new query resets to the first page
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      // First mount reflects the server-rendered page-1 data — don't refetch...
      // UNLESS that render failed (initialFests === null), in which case fall
      // through and fetch on the client to recover.
      if (initialFests !== null) return;
    }
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));

    fetch(`${getApiUrl()}/api/fests?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const response = await res.json();
        if (!response.success) throw new Error("Request was not successful");
        setFests(Array.isArray(response.data) ? response.data : []);
        // New API shape includes `pagination`; fall back gracefully if absent.
        setPagination(response.pagination ?? null);
      })
      .catch((err) => {
        console.error("Failed to fetch fests:", err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, page, reloadKey]);

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
                onClick={() => setReloadKey((k) => k + 1)}
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
                  image={fest.image || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop"}
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
