"use client";

import { useRouter } from "next/navigation";

const events = [
  {
    id: 1,
    name: "Proshow Day 1",
    location: "Main Ground",
    date: "Feb 14, 2025",
    time: "7:00 PM",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=300&fit=crop",
    status: "upcoming",
    ticketsSold: 555,
    totalTickets: 1125,
  },
  {
    id: 2,
    name: "Proshow Day 2",
    location: "Main Ground",
    date: "Feb 15, 2025",
    time: "7:00 PM",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=300&fit=crop",
    status: "upcoming",
    ticketsSold: 365,
    totalTickets: 875,
  },
  {
    id: 3,
    name: "Robowars",
    location: "Central Arena",
    date: "Feb 15, 2025",
    time: "10:00 AM",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=300&fit=crop",
    status: "upcoming",
    ticketsSold: 212,
    totalTickets: 550,
  },
  {
    id: 4,
    name: "Hackathon 2025",
    location: "Computer Center",
    date: "Feb 16, 2025",
    time: "9:00 AM",
    image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=300&fit=crop",
    status: "upcoming",
    ticketsSold: 120,
    totalTickets: 150,
  },
  {
    id: 5,
    name: "Cultural Night",
    location: "Auditorium",
    date: "Feb 17, 2025",
    time: "6:00 PM",
    image: "https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=400&h=300&fit=crop",
    status: "upcoming",
    ticketsSold: 280,
    totalTickets: 500,
  },
];

export default function FestEvents() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Total Events</p>
          <p className="text-2xl font-bold text-[#29104A]">{events.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Total Tickets Sold</p>
          <p className="text-2xl font-bold text-[#29104A]">
            {events.reduce((sum, e) => sum + e.ticketsSold, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Capacity Filled</p>
          <p className="text-2xl font-bold text-[#522C5D]">
            {Math.round((events.reduce((sum, e) => sum + e.ticketsSold, 0) / events.reduce((sum, e) => sum + e.totalTickets, 0)) * 100)}%
          </p>
        </div>
      </div>

      {/* Events Grid */}
      <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#29104A] mb-6">All Events</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => router.push(`/host/events/${event.id}/manage?from=admin`)}
              className="group cursor-pointer border border-[#C5BAC4] rounded-xl overflow-hidden hover:shadow-lg hover:border-[#522C5D] transition-all"
            >
              <div className="relative h-40 overflow-hidden">
                <img
                  src={event.image}
                  alt={event.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-1 bg-green-500 text-white text-xs font-medium rounded-lg">
                    {event.status}
                  </span>
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-[#29104A]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-4 py-2 bg-white text-[#29104A] rounded-lg font-semibold text-sm">
                    View Details
                  </span>
                </div>
              </div>

              <div className="p-4">
                <h3 className="font-semibold text-[#29104A] group-hover:text-[#522C5D] transition-colors">
                  {event.name}
                </h3>
                <p className="text-sm text-[#6B597F] mt-1">
                  {event.location}
                </p>
                <p className="text-sm text-[#C5BAC4] mt-0.5">
                  {event.date} • {event.time}
                </p>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#6B597F]">Tickets sold</span>
                    <span className="font-medium text-[#29104A]">
                      {event.ticketsSold}/{event.totalTickets}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#C5BAC4]/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#29104A] to-[#522C5D] rounded-full"
                      style={{ width: `${(event.ticketsSold / event.totalTickets) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
