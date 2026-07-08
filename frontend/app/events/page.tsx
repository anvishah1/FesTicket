import type { Metadata } from "next";
import { serverFetch, siteUrl } from "@/lib/serverApi";
import EventsDiscoverClient from "./EventsDiscoverClient";

// SEO-05: global cross-fest discover page. Server-fetches the first page for SEO
// + fast first paint; the client island owns the facets. Static metadata (the
// page content is the same URL regardless of facets, which live in client state).

export const metadata: Metadata = {
  title: "Discover Events",
  description:
    "Browse and book tickets for college-fest events across every fest on tiqr — filter by category, date, city, online, and free events.",
  alternates: { canonical: siteUrl("/events") },
  openGraph: {
    title: "Discover Events | tiqr",
    description: "Browse and book tickets for college-fest events across every fest on tiqr.",
    url: siteUrl("/events"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Discover Events | tiqr",
    description: "Browse and book tickets for college-fest events across every fest on tiqr.",
  },
};

// Revalidate the seed page periodically; the client refetches on any facet change.
export const revalidate = 120;

export default async function EventsDiscoverPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { status, data, body } = await serverFetch<any[]>("/api/events?page=1&limit=12&sort=date", { revalidate });
  // Distinguish a genuine empty result ([]) from a transient backend failure
  // (null): the island refetches on mount when it receives null instead of
  // getting stuck on a misleading empty state (a failed render is ISR-cached).
  const initialEvents = status === 200 ? (Array.isArray(data) ? data : []) : null;
  const initialPagination = body?.pagination ?? null;

  return <EventsDiscoverClient initialEvents={initialEvents} initialPagination={initialPagination} />;
}
