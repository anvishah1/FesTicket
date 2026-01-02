"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface Event {
  id: number;
  name: string;
  date: string;
  time: string;
  venue: string;
  description: string;
  image: string;
  category: string;
  festId: number;
}

interface FestInfo {
  id: number;
  name: string;
  college: string;
}

// Sample events data - will be replaced with API call
const sampleEvents: Event[] = [
  {
    id: 1,
    name: "Proshow Day 1",
    date: "Feb 14, 2025",
    time: "7:00 PM",
    venue: "Main Ground",
    description: "Opening night featuring top artists",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=400&fit=crop",
    category: "Entertainment",
    festId: 1,
  },
  {
    id: 2,
    name: "Proshow Day 2",
    date: "Feb 15, 2025",
    time: "7:00 PM",
    venue: "Main Ground",
    description: "EDM night with international DJs",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
    category: "Entertainment",
    festId: 1,
  },
  {
    id: 3,
    name: "Robowars",
    date: "Feb 15, 2025",
    time: "10:00 AM",
    venue: "Central Arena",
    description: "Battle of the machines - robot combat championship",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=400&fit=crop",
    category: "Technical",
    festId: 1,
  },
  {
    id: 4,
    name: "League of Machines",
    date: "Feb 16, 2025",
    time: "9:00 AM",
    venue: "Tech Hall",
    description: "Autonomous robotics competition",
    image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=400&fit=crop",
    category: "Technical",
    festId: 1,
  },
  {
    id: 5,
    name: "Drone Race",
    date: "Feb 16, 2025",
    time: "2:00 PM",
    venue: "Open Field",
    description: "High-speed drone racing championship",
    image: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&h=400&fit=crop",
    category: "Technical",
    festId: 1,
  },
  {
    id: 6,
    name: "Escape Room",
    date: "Feb 14-17, 2025",
    time: "All Day",
    venue: "Block A",
    description: "Solve puzzles and escape within time limit",
    image: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=400&h=400&fit=crop",
    category: "Fun",
    festId: 1,
  },
  {
    id: 7,
    name: "Hackathon",
    date: "Feb 15-16, 2025",
    time: "24 Hours",
    venue: "Computer Center",
    description: "48-hour coding marathon with amazing prizes",
    image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=400&fit=crop",
    category: "Technical",
    festId: 1,
  },
  {
    id: 8,
    name: "Dance Battle",
    date: "Feb 17, 2025",
    time: "4:00 PM",
    venue: "Auditorium",
    description: "Solo and group dance competition",
    image: "https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=400&h=400&fit=crop",
    category: "Cultural",
    festId: 1,
  },
];

// Sample fests data - will be replaced with API call
const sampleFests: FestInfo[] = [
  { id: 1, name: "Tathva", college: "NIT Calicut" },
  { id: 2, name: "Mood Indigo", college: "IIT Bombay" },
  { id: 3, name: "Saarang", college: "IIT Madras" },
  { id: 4, name: "Rendezvous", college: "IIT Delhi" },
  { id: 5, name: "Ragam", college: "NIT Calicut" },
  { id: 6, name: "Festember", college: "NIT Trichy" },
];

export default function EventsPage() {
  const params = useParams();
  const router = useRouter();
  const festId = Number(params.festId);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [festInfo, setFestInfo] = useState<FestInfo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  useEffect(() => {
    // TODO: Replace with actual API calls
    // Promise.all([
    //   fetch(`http://localhost:4000/api/fests/${festId}`),
    //   fetch(`http://localhost:4000/api/fests/${festId}/events`)
    // ])
    //   .then(([festRes, eventsRes]) => Promise.all([festRes.json(), eventsRes.json()]))
    //   .then(([festData, eventsData]) => {
    //     setFestInfo(festData);
    //     setEvents(eventsData);
    //     setLoading(false);
    //   });

    // For now, using sample data - filter events by festId
    const fest = sampleFests.find((f) => f.id === festId);
    const festEvents = sampleEvents.filter((e) => e.festId === festId);
    
    setFestInfo(fest || null);
    setEvents(festEvents);
    setLoading(false);
  }, [festId]);

  const handleEventClick = (eventId: number) => {
    router.push(`/fests/${festId}/events/${eventId}`);
  };

  const categories = events.length > 0
    ? ["All", ...Array.from(new Set(events.map((e) => e.category)))]
    : ["All"];

  const filteredEvents = events.filter(
    (event) => selectedCategory === "All" || event.category === selectedCategory
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
                subtitle={event.category}
                description={`${event.date} • ${event.time}`}
                image={event.image}
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

