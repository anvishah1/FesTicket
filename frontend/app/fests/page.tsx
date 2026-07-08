import type { Metadata } from "next";
import { serverFetch, siteUrl } from "@/lib/serverApi";
import FestsListClient, { type Fest, type Pagination } from "./FestsListClient";

// SEO-01: server-render the fests index (page 1). The client island handles
// search + pagination.
export const metadata: Metadata = {
  title: "Discover Fests",
  description: "Explore the most exciting college festivals across India and book tickets on tiqr.",
  alternates: { canonical: siteUrl("/fests") },
  openGraph: {
    title: "Discover Fests | tiqr",
    description: "Explore the most exciting college festivals across India and book tickets on tiqr.",
    url: siteUrl("/fests"),
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Discover Fests | tiqr" },
};

export default async function FestsPage() {
  const { status, data, body } = await serverFetch<Fest[]>("/api/fests?page=1", { revalidate: 120 });
  // null on a transient backend failure (island refetches on mount) vs [] for a
  // genuinely empty result — so an outage at render time isn't a sticky "No fests".
  const initialFests = status === 200 ? (Array.isArray(data) ? data : []) : null;
  const initialPagination = (body?.pagination as Pagination) ?? null;
  return <FestsListClient initialFests={initialFests} initialPagination={initialPagination} />;
}
