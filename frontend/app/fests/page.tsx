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
  const { data, body } = await serverFetch<Fest[]>("/api/fests?page=1", { revalidate: 120 });
  const initialFests = Array.isArray(data) ? data : [];
  const initialPagination = (body?.pagination as Pagination) ?? null;
  return <FestsListClient initialFests={initialFests} initialPagination={initialPagination} />;
}
