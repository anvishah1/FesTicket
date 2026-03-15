"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

interface Fest {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  college: string;
  description: string | null;
  image: string | null;
}

export default function FestsPage() {
  const router = useRouter();
  const [fests, setFests] = useState<Fest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch fests from backend API
    fetch(`${getApiUrl()}/api/fests`)
      .then((res) => res.json())
      .then((response) => {
        if (response.success) {
          setFests(response.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch fests:", err);
        setLoading(false);
      });
  }, []);

  const formatDate = (startDate: string | null, endDate: string | null) => {
    if (!startDate) return "Date TBA";
    const start = new Date(startDate);
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    if (endDate) {
      const end = new Date(endDate);
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", options)}`;
    }
    return start.toLocaleDateString("en-US", options);
  };

  const handleFestClick = (festId: number) => {
    router.push(`/fests/${festId}/events`);
  };

  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="py-8 px-4">
        {/* Page Title */}
        <div className="max-w-6xl mx-auto mb-8">
          <h1 className="text-3xl font-bold text-[#29104A]">Discover Fests</h1>
          <p className="text-[#6B597F] mt-1">
            Explore the most exciting college festivals across India
          </p>
        </div>

      {/* Cards Grid */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <p className="text-[#6B597F]">Loading fests...</p>
        ) : fests.length === 0 ? (
          <p className="text-[#6B597F]">No fests found</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {fests.map((fest) => (
              <Card
                key={fest.id}
                title={fest.name}
                subtitle={fest.college}
                description={formatDate(fest.startDate, fest.endDate)}
                image={fest.image || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop"}
                onClick={() => handleFestClick(fest.id)}
              />
            ))}
          </div>
        )}
      </div>
      </main>
      <Footer />
    </div>
  );
}
