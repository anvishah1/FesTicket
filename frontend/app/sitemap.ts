import type { MetadataRoute } from "next";
import { serverFetch, siteUrl } from "@/lib/serverApi";
import { labelToSlug } from "@/lib/categories";

// SEO-04: dynamic sitemap of every crawlable public page. Fest/event URLs come
// from the lightweight backend feeds (GET /api/{events,fests}/sitemap) which
// apply the same trusted visibility gate as the public lists, so no DRAFT/PRIVATE
// event or soft-deleted fest ever leaks here. Cached/revalidated (below) so a
// crawler hit doesn't run two DB queries every time; a newly published event
// appears after the revalidation window.

type SitemapRow = { id: number; updatedAt?: string | null };

// Revalidate hourly (also passed to the fetches so both layers agree).
export const revalidate = 3600;

function safeDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [eventsRes, festsRes, catsRes] = await Promise.all([
    serverFetch<SitemapRow[]>("/api/events/sitemap", { revalidate }),
    serverFetch<SitemapRow[]>("/api/fests/sitemap", { revalidate }),
    serverFetch<{ category: string; count: number }[]>("/api/events/categories", { revalidate }),
  ]);
  const events = Array.isArray(eventsRes.data) ? eventsRes.data : [];
  const fests = Array.isArray(festsRes.data) ? festsRes.data : [];
  // SEO-10: only category landing pages that actually have events (a 0-count
  // page is thin content we don't want crawled).
  const categories = (Array.isArray(catsRes.data) ? catsRes.data : []).filter((c) => c.count > 0);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/fests"), changeFrequency: "daily", priority: 0.8 },
    // SEO-05 global discover page. (Category landing pages come with SEO-10.)
    { url: siteUrl("/events"), changeFrequency: "daily", priority: 0.8 },
  ];

  const festRoutes: MetadataRoute.Sitemap = fests.map((f) => ({
    url: siteUrl(`/fests/${f.id}/events`),
    lastModified: safeDate(f.updatedAt),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const eventRoutes: MetadataRoute.Sitemap = events.map((e) => ({
    url: siteUrl(`/events/${e.id}`),
    lastModified: safeDate(e.updatedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories
    .map((c) => labelToSlug(c.category))
    .filter((slug): slug is string => !!slug)
    .map((slug) => ({
      url: siteUrl(`/events/category/${slug}`),
      changeFrequency: "weekly",
      priority: 0.5,
    }));

  return [...staticRoutes, ...festRoutes, ...eventRoutes, ...categoryRoutes];
}
