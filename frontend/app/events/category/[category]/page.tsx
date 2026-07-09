import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverFetch, siteUrl } from "@/lib/serverApi";
import { slugToLabel } from "@/lib/categories";
import EventsDiscoverClient from "../../EventsDiscoverClient";

// SEO-10: per-category landing page (e.g. /events/category/concert) to rank for
// category queries. Reuses the SEO-05 discover grid with the category pinned. An
// unknown slug -> notFound(); a valid-but-empty category renders the empty state.

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const label = slugToLabel(category);
  if (!label) return { title: "Category", robots: { index: false, follow: false } };

  const title = `${label} Events`;
  const description = `Discover and book ${label.toLowerCase()} events across every college fest on FesTicket.`;
  const canonical = siteUrl(`/events/category/${category.toLowerCase()}`);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: `${label} Events | FesTicket`, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title: `${label} Events | FesTicket`, description },
  };
}

export default async function CategoryLandingPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const label = slugToLabel(category);
  if (!label) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { status, data, body } = await serverFetch<any[]>(
    `/api/events?category=${encodeURIComponent(label)}&page=1&limit=12&sort=date`,
    { revalidate }
  );
  // null on a transient failure (island refetches on mount) vs [] for a genuine
  // empty category.
  const initialEvents = status === 200 ? (Array.isArray(data) ? data : []) : null;
  const initialPagination = body?.pagination ?? null;

  return (
    <EventsDiscoverClient
      initialEvents={initialEvents}
      initialPagination={initialPagination}
      lockedCategory={label}
    />
  );
}
