"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * This route previously rendered hardcoded sample event data. The real event
 * detail page lives at /events/[id] (it fetches the actual event, tickets, and
 * map). To avoid duplicating that page and showing fabricated data, we simply
 * redirect here to the canonical event page.
 */
export default function FestEventRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  useEffect(() => {
    if (eventId) {
      router.replace(`/events/${eventId}`);
    }
  }, [eventId, router]);

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[#C5BAC4]/40 rounded w-1/3" />
          <div className="h-64 bg-[#C5BAC4]/40 rounded" />
          <div className="h-32 bg-[#C5BAC4]/30 rounded" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
