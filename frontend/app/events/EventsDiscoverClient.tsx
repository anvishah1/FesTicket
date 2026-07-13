"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
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

// FE-12: labels resolved from the dictionary (t("sort…")) at render time.
const SORT_OPTIONS = [
  { value: "date", key: "sortDate" },
  { value: "trending", key: "sortTrending" },
  { value: "name", key: "sortName" },
  { value: "newest", key: "sortNewest" },
] as const;

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
  const t = useTranslations("events");
  const locale = useLocale();
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
    <div className="min-h-screen bg-[var(--surface-tint)]">
      <Header />
      <main className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            {lockedCategory ? t("titleCategory", { category: lockedCategory }) : t("title")}
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            {lockedCategory
              ? t("subtitleCategory", { category: lockedCategory.toLowerCase() })
              : t("subtitle")}
          </p>
        </div>

        <div className="max-w-6xl mx-auto mt-6 flex flex-col gap-6 lg:flex-row">
          {/* Facet sidebar */}
          <aside className="w-full lg:w-64 lg:shrink-0">
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--surface)] p-4 space-y-5">
              <div>
                <label htmlFor="q" className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                  {t("searchLabel")}
                </label>
                <input
                  id="q"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--border-plum)] focus:outline-none"
                />
              </div>

              {!lockedCategory && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">{t("categoryLabel")}</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t("categoryFilterAria")}>
                    {["All", ...CATEGORY_LABELS].map((c) => (
                      <button
                        key={c}
                        onClick={() => setCategory(c)}
                        aria-pressed={category === c}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          category === c ? "bg-[var(--fill-plum)] text-white" : "bg-[var(--surface-tint)] text-[var(--text-muted)] hover:bg-[var(--surface-card)]"
                        }`}
                      >
                        {c === "All" ? t("categoryAll") : c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">{t("dateRangeLabel")}</p>
                {/*
                  The range can never invert: `max`/`min` stop the native picker
                  from offering an impossible date, and the onChange clamps the
                  other side if it would be left behind (e.g. moving "from" past an
                  already-chosen "to" pushes "to" along instead of leaving from>to).
                */}
                <div className="flex flex-col gap-2">
                  <input
                    type="date"
                    aria-label={t("fromDateAria")}
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDateFrom(next);
                      if (next && dateTo && next > dateTo) setDateTo(next);
                    }}
                    className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-plum)] focus:outline-none"
                  />
                  <input
                    type="date"
                    aria-label={t("toDateAria")}
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDateTo(next);
                      if (next && dateFrom && next < dateFrom) setDateFrom(next);
                    }}
                    className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-plum)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="college" className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                  {t("cityCollegeLabel")}
                </label>
                <input
                  id="college"
                  type="text"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  placeholder={t("cityCollegePlaceholder")}
                  className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--border-plum)] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={onlineOnly}
                    onChange={(e) => setOnlineOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-card)] text-[var(--text-secondary)] focus:ring-[var(--ring-plum)]"
                  />
                  {t("onlineOnly")}
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={freeOnly}
                    onChange={(e) => setFreeOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-card)] text-[var(--text-secondary)] focus:ring-[var(--ring-plum)]"
                  />
                  {t("freeOnly")}
                </label>
              </div>

              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-sm text-[var(--text-secondary)] hover:underline">
                  {t("clearFilters")}
                </button>
              )}
            </div>
          </aside>

          {/* Results */}
          <section className="flex-1">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {!loading && typeof total === "number" ? (
                <p className="text-sm text-[var(--text-muted)]" role="status" aria-live="polite">
                  {t("resultsFound", { count: total })}
                </p>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                {t("sortBy")}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label={t("sortAria")}
                  className="rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-plum)] focus:outline-none"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.key)}
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
                    subtitle={event.category || event.festName || t("defaultSubtitle")}
                    description={`${
                      event.startDate
                        ? new Date(event.startDate).toLocaleDateString(locale, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })
                        : t("dateTba")
                    }${event.venue ? ` • ${event.venue}` : ""}`}
                    image={
                      event.image ||
                      FALLBACK_POSTER
                    }
                    discount={event.discount}
                    going={event.goingCount}
                    hoverText={t("viewDetails")}
                    href={`/events/${event.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-card)] p-10 text-center">
                <p className="text-[var(--text-primary)] font-medium">{t("emptyTitle")}</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">{t("emptyHint")}</p>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="mt-4 text-sm text-[var(--text-secondary)] hover:underline">
                    {t("clearFilters")}
                  </button>
                )}
              </div>
            )}

            {!loading && pagination && totalPages > 1 && (
              <nav aria-label={t("paginationAria")} className="mt-8 flex items-center justify-center gap-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label={t("prevAria")}
                  className="rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-card)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden="true">←</span> {t("prev")}
                </button>
                <span className="text-sm text-[var(--text-muted)]" aria-current="page">
                  {t("pageOf", { page, total: totalPages })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label={t("nextAria")}
                  className="rounded-lg border border-[var(--border-card)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-card)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("next")} <span aria-hidden="true">→</span>
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
