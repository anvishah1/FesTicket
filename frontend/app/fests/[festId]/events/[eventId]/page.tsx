"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface Event {
  id: number;
  name: string;
  date: string;
  time: string;
  venue: string;
  venueAddress: string;
  description: string;
  image: string;
  category: string;
  festId: number;
  price: number;
  aboutEvent: string;
}

// Extended sample events data with price and detailed info
const sampleEvents: Event[] = [
  {
    id: 1,
    name: "Proshow Day 1",
    date: "Feb 14, 2025",
    time: "7:00 PM - 11:00 PM",
    venue: "Main Ground",
    venueAddress: "NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "Opening night featuring top artists",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=600&fit=crop",
    category: "Entertainment",
    festId: 1,
    price: 999,
    aboutEvent: "Get ready for an electrifying opening night! Proshow Day 1 brings you the biggest names in music for an unforgettable evening of performances. Experience live music, stunning visuals, and an atmosphere that will leave you wanting more.\n\nTerms and Conditions:\n\n1. Entry Requirements: Attendees must show a valid ticket and carry a valid ID.\n2. No outside food or beverages allowed.\n3. Event timings are subject to change.\n4. No refunds after purchase.\n5. Follow all venue safety guidelines.",
  },
  {
    id: 2,
    name: "Proshow Day 2",
    date: "Feb 15, 2025",
    time: "7:00 PM - 12:00 AM",
    venue: "Main Ground",
    venueAddress: "NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "EDM night with international DJs",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=600&fit=crop",
    category: "Entertainment",
    festId: 1,
    price: 1499,
    aboutEvent: "The ultimate EDM experience awaits! International DJs will take you on a musical journey with the best electronic dance music. Dance the night away under the stars with incredible beats and production.\n\nTerms and Conditions:\n\n1. Entry Requirements: Attendees must show a valid ticket and carry a valid ID.\n2. Age restriction: 18+ only.\n3. No professional cameras allowed.\n4. Event timings are subject to change.\n5. No refunds after purchase.",
  },
  {
    id: 3,
    name: "Robowars",
    date: "Feb 15, 2025",
    time: "10:00 AM - 6:00 PM",
    venue: "Central Arena",
    venueAddress: "Central Arena, NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "Battle of the machines - robot combat championship",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=600&fit=crop",
    category: "Technical",
    festId: 1,
    price: 299,
    aboutEvent: "Witness the most intense robot combat championship! Teams from across the country bring their custom-built fighting robots to compete in this thrilling battle of engineering and strategy.\n\nTerms and Conditions:\n\n1. Entry for spectators requires valid ticket.\n2. Participants must follow all safety regulations.\n3. Keep a safe distance from the arena.\n4. Photography allowed in designated areas only.",
  },
  {
    id: 4,
    name: "League of Machines",
    date: "Feb 16, 2025",
    time: "9:00 AM - 5:00 PM",
    venue: "Tech Hall",
    venueAddress: "Tech Hall, NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "Autonomous robotics competition",
    image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=800&h=600&fit=crop",
    category: "Technical",
    festId: 1,
    price: 199,
    aboutEvent: "Experience the future of robotics! Watch autonomous robots navigate complex challenges, demonstrating cutting-edge AI and engineering. A must-see for tech enthusiasts.\n\nTerms and Conditions:\n\n1. Valid ticket required for entry.\n2. Follow all venue guidelines.\n3. No interference with competing robots.",
  },
  {
    id: 5,
    name: "Drone Race",
    date: "Feb 16, 2025",
    time: "2:00 PM - 7:00 PM",
    venue: "Open Field",
    venueAddress: "Open Field, NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "High-speed drone racing championship",
    image: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&h=600&fit=crop",
    category: "Technical",
    festId: 1,
    price: 249,
    aboutEvent: "Feel the adrenaline rush as FPV drones race at incredible speeds through challenging obstacle courses. Watch skilled pilots compete for the championship title.\n\nTerms and Conditions:\n\n1. Spectators must remain in designated viewing areas.\n2. Valid ticket required.\n3. Follow all safety instructions from marshals.",
  },
  {
    id: 6,
    name: "Escape Room",
    date: "Feb 14-17, 2025",
    time: "10:00 AM - 8:00 PM",
    venue: "Block A",
    venueAddress: "Block A, NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "Solve puzzles and escape within time limit",
    image: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=800&h=600&fit=crop",
    category: "Fun",
    festId: 1,
    price: 149,
    aboutEvent: "Put your problem-solving skills to the test! Work with your team to solve intricate puzzles and escape before time runs out. Multiple themed rooms available.\n\nTerms and Conditions:\n\n1. Teams of 2-6 members allowed.\n2. 45-minute time limit per session.\n3. No phones allowed inside the room.\n4. Pre-booking recommended.",
  },
  {
    id: 7,
    name: "Hackathon",
    date: "Feb 15-16, 2025",
    time: "24 Hours",
    venue: "Computer Center",
    venueAddress: "Computer Center, NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "48-hour coding marathon with amazing prizes",
    image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop",
    category: "Technical",
    festId: 1,
    price: 0,
    aboutEvent: "Join the ultimate coding challenge! Build innovative solutions in 48 hours and compete for exciting prizes. Food and refreshments provided. Network with industry mentors.\n\nTerms and Conditions:\n\n1. Teams of 2-4 members.\n2. All participants must be students.\n3. Original work only - plagiarism leads to disqualification.\n4. Bring your own laptops.",
  },
  {
    id: 8,
    name: "Dance Battle",
    date: "Feb 17, 2025",
    time: "4:00 PM - 9:00 PM",
    venue: "Auditorium",
    venueAddress: "Main Auditorium, NIT Calicut Campus, Kozhikode, Kerala 673601, India",
    description: "Solo and group dance competition",
    image: "https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=800&h=600&fit=crop",
    category: "Cultural",
    festId: 1,
    price: 199,
    aboutEvent: "Showcase your dance moves or watch incredible performances! Both solo and group categories available. All dance styles welcome - from classical to hip-hop.\n\nTerms and Conditions:\n\n1. Registration closes 24 hours before event.\n2. Performance time limit: 5 mins (solo), 8 mins (group).\n3. Music must be submitted in advance.\n4. Props allowed with prior approval.",
  },
];

export default function EventBookingPage() {
  const params = useParams();
  const router = useRouter();
  const festId = Number(params.festId);
  const eventId = Number(params.eventId);

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    // TODO: Replace with actual API call
    const foundEvent = sampleEvents.find(
      (e) => e.id === eventId && e.festId === festId
    );
    setEvent(foundEvent || null);
    setLoading(false);
  }, [festId, eventId]);

  const handleBookNow = () => {
    // TODO: Implement booking logic
    alert(`Booking for ${event?.name} - ₹${event?.price}`);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f9fa]">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-32 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-96 bg-gray-200 rounded-2xl"></div>
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-[#f8f9fa] py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-500 text-lg">Event not found</p>
          <button
            onClick={() => router.push(`/fests/${festId}/events`)}
            className="mt-4 text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Events
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f9fa]">
      {/* Hero Section */}
      <div className="bg-[#1a1a2e] text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(`/fests/${festId}/events`)}
            className="text-gray-300 hover:text-white font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Events
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left - Event Poster */}
          <div className="lg:col-span-3">
            <div className="bg-[#1a1a2e] rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={event.image}
                alt={event.name}
                className="w-full h-auto object-cover aspect-[4/3]"
              />
            </div>
          </div>

          {/* Right - Event Details */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-8">
              {/* Event Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-6 leading-tight">
                {event.name}
              </h1>

              {/* Event Info List */}
              <div className="space-y-5">
                {/* Category */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{event.category}</p>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{event.date}</p>
                    <p className="text-sm text-gray-500">{event.time}</p>
                  </div>
                </div>

                {/* Location */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{event.venue}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">{event.venueAddress}</p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-6"></div>

              {/* Price & Book Button */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Starts from</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {event.price === 0 ? "Free" : `₹${event.price.toLocaleString()}`}
                  </p>
                </div>
                <button
                  onClick={handleBookNow}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8 py-4 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                  Book Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            {/* About The Event */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-xl font-bold text-gray-900">About The Event</h2>
                <div className="flex gap-2">
                  <button className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="prose prose-gray max-w-none">
                {event.aboutEvent.split('\n').map((paragraph, index) => (
                  <p key={index} className="text-gray-600 leading-relaxed mb-4">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Location Card */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Location</h3>
              <div className="space-y-3">
                <p className="font-semibold text-gray-900">{event.venue}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{event.venueAddress}</p>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.venueAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium text-sm mt-2"
                >
                  View on Map
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}





