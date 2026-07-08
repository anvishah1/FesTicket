import type { MetadataRoute } from "next";
import { serverFetch, siteUrl } from "@/lib/serverApi";

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
  const [eventsRes, festsRes] = await Promise.all([
    serverFetch<SitemapRow[]>("/api/events/sitemap", { revalidate }),
    serverFetch<SitemapRow[]>("/api/fests/sitemap", { revalidate }),
  ]);
  const events = Array.isArray(eventsRes.data) ? eventsRes.data : [];
  const fests = Array.isArray(festsRes.data) ? festsRes.data : [];

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/fests"), changeFrequency: "daily", priority: 0.8 },
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

  return [...staticRoutes, ...festRoutes, ...eventRoutes];
}
