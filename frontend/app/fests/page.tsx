"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface Fest {
  id: number;
  name: string;
  date: string;
  college: string;
  description: string;
  image: string;
}

export default function FestsPage() {
  const router = useRouter();
  const [fests, setFests] = useState<Fest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with actual API call
    // fetch("http://localhost:4000/api/fests")
    //   .then((res) => res.json())
    //   .then((data) => {
    //     setFests(data);
    //     setLoading(false);
    //   });

    // For now, using sample data
    const sampleFests: Fest[] = [
      {
        id: 1,
        name: "Tathva",
        date: "Feb 14-17, 2025",
        college: "NIT Calicut",
        description: "The annual international sports and cultural carnival",
        image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
      },
      {
        id: 2,
        name: "Mood Indigo",
        date: "Dec 27-30, 2025",
        college: "IIT Bombay",
        description: "Asia's largest college cultural festival",
        image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop",
      },
      {
        id: 3,
        name: "Saarang",
        date: "Jan 10-14, 2025",
        college: "IIT Madras",
        description: "One of the largest cultural festivals in India",
        image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop",
      },
      {
        id: 4,
        name: "Rendezvous",
        date: "Oct 18-21, 2025",
        college: "IIT Delhi",
        description: "The annual cultural festival of IIT Delhi",
        image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=400&fit=crop",
      },
      {
        id: 5,
        name: "Ragam",
        date: "Dec 15-17, 2025",
        college: "NIT Calicut",
        description: "Asia's largest science and technology festival",
        image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=400&fit=crop",
      },
      {
        id: 6,
        name: "Festember",
        date: "Sep 5-8, 2025",
        college: "NIT Trichy",
        description: "The annual cultural festival of NIT Trichy",
        image: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=400&fit=crop",
      },
    ];

    setFests(sampleFests);
    setLoading(false);
  }, []);

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
                description={fest.date}
                image={fest.image}
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
