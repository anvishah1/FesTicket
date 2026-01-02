"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";

interface TicketType {
  name: string;
  price: number;
  sold: number;
  total: number;
}

interface HostEvent {
  id: number;
  name: string;
  date: string;
  time: string;
  venue: string;
  image: string;
  category: string;
  status: "upcoming" | "past" | "live";
  ticketTypes: TicketType[];
  discount: number; // percentage
  totalRevenue: number;
}

// Sample host data
const hostInfo = {
  name: "Tathva Organizing Committee",
  email: "organizer@tathva.org",
  organization: "NIT Calicut",
};

// Sample events data for host
const sampleHostEvents: HostEvent[] = [
  {
    id: 1,
    name: "Proshow Day 1",
    date: "Feb 14, 2025",
    time: "7:00 PM",
    venue: "Main Ground",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=400&fit=crop",
    category: "Entertainment",
    status: "upcoming",
    ticketTypes: [
      { name: "General", price: 999, sold: 450, total: 1000 },
      { name: "VIP", price: 2499, sold: 85, total: 100 },
      { name: "VVIP", price: 4999, sold: 20, total: 25 },
    ],
    discount: 10,
    totalRevenue: 789525,
  },
  {
    id: 2,
    name: "Proshow Day 2",
    date: "Feb 15, 2025",
    time: "7:00 PM",
    venue: "Main Ground",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
    category: "Entertainment",
    status: "upcoming",
    ticketTypes: [
      { name: "General", price: 1499, sold: 320, total: 800 },
      { name: "VIP", price: 3499, sold: 45, total: 75 },
    ],
    discount: 0,
    totalRevenue: 637235,
  },
  {
    id: 3,
    name: "Robowars",
    date: "Feb 15, 2025",
    time: "10:00 AM",
    venue: "Central Arena",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=400&fit=crop",
    category: "Technical",
    status: "upcoming",
    ticketTypes: [
      { name: "Spectator", price: 299, sold: 180, total: 500 },
      { name: "Participant", price: 599, sold: 32, total: 50 },
    ],
    discount: 15,
    totalRevenue: 62098,
  },
  {
    id: 4,
    name: "Hackathon 2024",
    date: "Dec 10, 2024",
    time: "9:00 AM",
    venue: "Computer Center",
    image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=400&fit=crop",
    category: "Technical",
    status: "past",
    ticketTypes: [
      { name: "Team Pass", price: 499, sold: 120, total: 150 },
    ],
    discount: 0,
    totalRevenue: 59880,
  },
  {
    id: 5,
    name: "Cultural Night 2024",
    date: "Nov 25, 2024",
    time: "6:00 PM",
    venue: "Auditorium",
    image: "https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=400&h=400&fit=crop",
    category: "Cultural",
    status: "past",
    ticketTypes: [
      { name: "General", price: 199, sold: 380, total: 400 },
      { name: "Premium", price: 499, sold: 95, total: 100 },
    ],
    discount: 5,
    totalRevenue: 117315,
  },
  {
    id: 6,
    name: "Tech Talk Series",
    date: "Oct 15, 2024",
    time: "2:00 PM",
    venue: "Seminar Hall",
    image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=400&fit=crop",
    category: "Technical",
    status: "past",
    ticketTypes: [
      { name: "Free Entry", price: 0, sold: 250, total: 300 },
    ],
    discount: 0,
    totalRevenue: 0,
  },
];

export default function HostDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "past">("all");
  const [events, setEvents] = useState<HostEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with API call
    setEvents(sampleHostEvents);
    setLoading(false);
  }, []);

  const filteredEvents = events.filter((event) => {
    if (activeTab === "all") return true;
    return event.status === activeTab;
  });

  const getTotalTicketsSold = (event: HostEvent) => {
    return event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
  };

  const getTotalTickets = (event: HostEvent) => {
    return event.ticketTypes.reduce((sum, t) => sum + t.total, 0);
  };

  const getTicketTypesDisplay = (event: HostEvent) => {
    return event.ticketTypes.map((t) => t.name).join(", ");
  };

  // Calculate summary stats
  const totalRevenue = events.reduce((sum, e) => sum + e.totalRevenue, 0);
  const totalTicketsSold = events.reduce((sum, e) => sum + getTotalTicketsSold(e), 0);
  const upcomingEventsCount = events.filter((e) => e.status === "upcoming").length;
  const pastEventsCount = events.filter((e) => e.status === "past").length;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fdfdff]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-[#C5BAC4] rounded w-48"></div>
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-[#C5BAC4] rounded-xl"></div>
              ))}
            </div>
            <div className="h-96 bg-[#C5BAC4] rounded-xl"></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fdfdff] text-[#29104A]">
      {/* Header */}
      <header className="border-b border-[#C5BAC4] bg-[#6B597F] backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#29104A] flex items-center justify-center font-bold text-white">
              T
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">Host Dashboard</h1>
              <p className="text-xs text-[#C5BAC4]">{hostInfo.organization}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push("/events/new/create")}
              className="px-4 py-2 bg-[#29104A] hover:bg-[#522C5D] text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Event
            </button>
            <div className="w-10 h-10 rounded-full bg-[#522C5D] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1 text-[#29104A]">Welcome back, {hostInfo.name.split(" ")[0]}! 👋</h2>
          <p className="text-[#6B597F]">Here's an overview of your events and ticket sales.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Total Revenue</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">₹{totalRevenue.toLocaleString()}</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Tickets Sold</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">{totalTicketsSold.toLocaleString()}</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Upcoming Events</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">{upcomingEventsCount}</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Past Events</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">{pastEventsCount}</p>
          </div>
        </div>

        {/* Events Table Section */}
        <div className="bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="px-6 py-5 border-b border-[#C5BAC4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-xl font-bold text-[#29104A]">Your Events</h3>
            <div className="flex gap-2">
              {(["all", "upcoming", "past"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-[#522C5D] text-white"
                      : "bg-[#C5BAC4]/30 text-[#6B597F] hover:bg-[#C5BAC4]"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#C5BAC4]/20">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Event</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Date</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Tickets Sold</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Ticket Types</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Discount</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Revenue</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C5BAC4]">
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#C5BAC4]/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={event.image}
                          alt={event.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div>
                          <p className="font-semibold text-[#29104A]">{event.name}</p>
                          <p className="text-sm text-[#6B597F]">{event.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[#29104A]">{event.date}</p>
                      <p className="text-sm text-[#6B597F]">{event.time}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[#29104A] font-medium">{getTotalTicketsSold(event)}</span>
                        <span className="text-[#C5BAC4]">/</span>
                        <span className="text-[#6B597F]">{getTotalTickets(event)}</span>
                      </div>
                      <div className="w-24 h-1.5 bg-[#C5BAC4] rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-[#522C5D] rounded-full"
                          style={{
                            width: `${(getTotalTicketsSold(event) / getTotalTickets(event)) * 100}%`,
                          }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {event.ticketTypes.map((type, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-[#C5BAC4]/30 rounded text-xs text-[#522C5D]"
                          >
                            {type.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {event.discount > 0 ? (
                        <span className="px-2 py-1 bg-[#522C5D]/10 text-[#522C5D] rounded-lg text-sm font-medium">
                          {event.discount}% OFF
                        </span>
                      ) : (
                        <span className="text-[#C5BAC4]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[#29104A] font-bold">
                        ₹{event.totalRevenue.toLocaleString()}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          event.status === "upcoming"
                            ? "bg-[#522C5D]/10 text-[#522C5D]"
                            : event.status === "live"
                            ? "bg-[#29104A]/10 text-[#29104A]"
                            : "bg-[#C5BAC4]/30 text-[#6B597F]"
                        }`}
                      >
                        {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => router.push(`/host/events/${event.id}/manage`)}
                        className="px-4 py-2 bg-[#522C5D]/10 hover:bg-[#522C5D] text-[#522C5D] hover:text-white rounded-lg transition-all font-medium text-sm flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredEvents.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-[#6B597F]">No events found in this category.</p>
            </div>
          )}
        </div>

        {/* Quick Stats per Event Type */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Events Preview */}
          <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-[#29104A] flex items-center gap-2">
                <span className="w-2 h-2 bg-[#522C5D] rounded-full"></span>
                Upcoming Events
              </h3>
              <button
                onClick={() => setActiveTab("upcoming")}
                className="text-sm text-[#522C5D] hover:text-[#29104A] transition-colors"
              >
                View all →
              </button>
            </div>
            <div className="space-y-4">
              {events
                .filter((e) => e.status === "upcoming")
                .slice(0, 3)
                .map((event) => (
                  <div
                    key={event.id}
                    className="group relative flex items-center gap-4 p-3 rounded-xl bg-[#C5BAC4]/20 hover:bg-[#C5BAC4]/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/host/events/${event.id}/manage`)}
                  >
                    <div className="relative">
                      <img
                        src={event.image}
                        alt={event.name}
                        className="w-14 h-14 rounded-lg object-cover"
                      />
                      {/* Hover overlay on image */}
                      <div className="absolute inset-0 bg-[#29104A]/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#29104A] truncate">{event.name}</p>
                      <p className="text-sm text-[#6B597F]">{event.date} • {event.time}</p>
                    </div>
                    <div className="text-right hidden group-hover:block">
                      <span className="px-3 py-1.5 bg-[#522C5D] text-white rounded-lg text-sm font-semibold">
                        Manage
                      </span>
                    </div>
                    <div className="text-right group-hover:hidden">
                      <p className="text-[#522C5D] font-bold">
                        {getTotalTicketsSold(event)}/{getTotalTickets(event)}
                      </p>
                      <p className="text-xs text-[#6B597F]">tickets</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Past Events Preview */}
          <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-[#29104A] flex items-center gap-2">
                <span className="w-2 h-2 bg-[#6B597F] rounded-full"></span>
                Past Events
              </h3>
              <button
                onClick={() => setActiveTab("past")}
                className="text-sm text-[#522C5D] hover:text-[#29104A] transition-colors"
              >
                View all →
              </button>
            </div>
            <div className="space-y-4">
              {events
                .filter((e) => e.status === "past")
                .slice(0, 3)
                .map((event) => (
                  <div
                    key={event.id}
                    className="group relative flex items-center gap-4 p-3 rounded-xl bg-[#C5BAC4]/20 hover:bg-[#C5BAC4]/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/host/events/${event.id}/manage`)}
                  >
                    <div className="relative">
                      <img
                        src={event.image}
                        alt={event.name}
                        className="w-14 h-14 rounded-lg object-cover grayscale"
                      />
                      {/* Hover overlay on image */}
                      <div className="absolute inset-0 bg-[#29104A]/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#29104A] truncate">{event.name}</p>
                      <p className="text-sm text-[#6B597F]">{event.date}</p>
                    </div>
                    <div className="text-right hidden group-hover:block">
                      <span className="px-3 py-1.5 bg-[#522C5D] text-white rounded-lg text-sm font-semibold">
                        Manage
                      </span>
                    </div>
                    <div className="text-right group-hover:hidden">
                      <p className="text-[#29104A] font-bold">
                        ₹{event.totalRevenue.toLocaleString()}
                      </p>
                      <p className="text-xs text-[#6B597F]">earned</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}

