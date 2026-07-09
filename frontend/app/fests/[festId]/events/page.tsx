import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverFetch, siteUrl } from "@/lib/serverApi";
import FestEventsClient, { type FestInfo } from "./FestEventsClient";

// SEO-01: server-render a fest's events page. Fetches the fest (with its events)
// on the server for metadata + the initial list; the island handles filters.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FestWithEvents = FestInfo & { description?: string | null; events?: any[] };

// FE-03: serve via ISR (list content is not time-sensitive like inventory).
// generateStaticParams prebuilds fests that have public events; others render
// on-demand.
export const revalidate = 120;

async function getFest(festId: string) {
  return serverFetch<FestWithEvents>(`/api/fests/${encodeURIComponent(festId)}`, { revalidate });
}

export async function generateStaticParams() {
  const { data } = await serverFetch<{ id: number }[]>("/api/fests/sitemap", { revalidate: 3600 });
  return (Array.isArray(data) ? data : []).slice(0, 100).map((f) => ({ festId: String(f.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ festId: string }> }): Promise<Metadata> {
  const { festId } = await params;
  const { status, data: fest } = await getFest(festId);
  if (status === 404) notFound();
  if (!fest) return { title: "Fest events", robots: { index: false, follow: false } };

  const title = `${fest.name} Events`;
  const description =
    (fest.description && String(fest.description).replace(/\s+/g, " ").trim().slice(0, 160)) ||
    `Browse and book tickets for events at ${fest.name}${fest.college ? `, ${fest.college}` : ""} on FesTicket.`;
  const canonical = siteUrl(`/fests/${fest.id}/events`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function FestEventsPage({ params }: { params: Promise<{ festId: string }> }) {
  const { festId } = await params;
  const { status, data: fest } = await getFest(festId);
  if (status === 404) notFound();
  return <FestEventsClient festId={Number(festId)} initialFest={fest} />;
}
