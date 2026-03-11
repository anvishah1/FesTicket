"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface Event {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  description: string | null;
  image: string | null;
  category: string | null;
}

interface FestInfo {
  id: number;
  name: string;
  college: string;
}

export default function EventsPage() {
  const params = useParams();
  const router = useRouter();
  const festId = Number(params.festId);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [festInfo, setFestInfo] = useState<FestInfo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const festRes = await fetch(`http://localhost:4000/api/fests/${festId}`);
        const festJson = await festRes.json();

        if (!festJson.success || !festJson.data) {
          setFestInfo(null);
          setEvents([]);
          setLoading(false);
          return;
        }

        setFestInfo({
          id: festJson.data.id,
          name: festJson.data.name,
          college: festJson.data.college,
        });

        const apiEvents = (festJson.data.events || []) as any[];
        const mappedEvents: Event[] = apiEvents.map((e) => ({
          id: e.id,
          name: e.name,
          startDate: e.startDate,
          endDate: e.endDate,
          venue: e.venue,
          description: e.shortDescription || e.description || null,
          image: e.image,
          category: e.category,
        }));

        setEvents(mappedEvents);
      } catch (err) {
        console.error("Failed to load fest events:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [festId]);

  const handleEventClick = (eventId: number) => {
    // Go to event details page; user can start booking from there
    router.push(`/events/${eventId}`);
  };

  const categories =
    events.length > 0
      ? ["All", ...Array.from(new Set(events.map((e) => e.category || "Other")))]
      : ["All"];

  const filteredEvents = events.filter(
    (event) => selectedCategory === "All" || (event.category || "Other") === selectedCategory
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <p className="text-[#6B597F]">Loading events...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!festInfo) {
    return (
      <div className="min-h-screen bg-[#fdfdff]">
        <Header />
        <main className="py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <p className="text-[#6B597F]">Fest not found</p>
            <button
              onClick={() => router.push("/fests")}
              className="mt-4 text-[#522C5D] hover:underline"
            >
              ← Back to Fests
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="py-8 px-4">
        {/* Page Title */}
        <div className="max-w-6xl mx-auto mb-8">
        <button
          onClick={() => router.push("/fests")}
          className="text-[#522C5D] hover:underline mb-4 flex items-center gap-1"
        >
          <span>←</span> Back to Fests
        </button>
        <h1 className="text-3xl font-bold text-[#29104A]">{festInfo.name} Events</h1>
        <p className="text-[#6B597F] mt-1">
          Explore all events at {festInfo.name} • {festInfo.college}
        </p>
      </div>

      {/* Category Filter */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? "bg-[#522C5D] text-white"
                  : "bg-white text-[#6B597F] hover:bg-[#C5BAC4]"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      <div className="max-w-6xl mx-auto">
        {filteredEvents.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredEvents.map((event) => (
              <Card
                key={event.id}
                title={event.name}
                subtitle={event.category || "Event"}
                description={`${event.startDate ? new Date(event.startDate).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" }
                ) : "Date TBA"}${event.venue ? ` • ${event.venue}` : ""}`}
                image={
                  event.image ||
                  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop"
                }
                hoverText="View Details"
                onClick={() => handleEventClick(event.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[#6B597F]">No events found in this category</p>
        )}
      </div>
      </main>
      <Footer />
    </div>
  );
}

