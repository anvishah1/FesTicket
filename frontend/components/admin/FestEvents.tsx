"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/auth";

interface AdminEvent {
  id: number;
  name: string;
  location: string;
  date: string;
  time: string;
  image: string;
  status: string;
  ticketsSold: number;
  totalTickets: number;
}

interface FestEventsProps {
  festId: number;
}

export default function FestEvents({ festId }: FestEventsProps) {
  const router = useRouter();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(
          `${getApiUrl()}/api/events?festId=${festId}`
        );
        const json = await res.json();
        if (!res.ok || !json.success) return;

        const mapped: AdminEvent[] = json.data.map((ev: any) => {
          const ticketsSold =
            ev.ticketTypes?.reduce(
              (sum: number, t: any) => sum + (t.sold || 0),
              0
            ) || 0;
          const totalTickets =
            ev.ticketTypes?.reduce(
              (sum: number, t: any) => sum + (t.quantity || 0),
              0
            ) || 0;

          return {
            id: ev.id,
            name: ev.name,
            location: ev.venue || ev.fest?.college || "TBA",
            date: ev.startDate
              ? new Date(ev.startDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "TBA",
            time: ev.startTime || "TBA",
            image:
              ev.image ||
              "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=300&fit=crop",
            status:
              ev.status?.toLowerCase() === "published"
                ? "upcoming"
                : (ev.status || "upcoming").toString().toLowerCase(),
            ticketsSold,
            totalTickets: totalTickets || 1,
          };
        });

        setEvents(mapped);
      } catch (err) {
        console.error("Failed to load admin events:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [festId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm animate-pulse h-24"
            />
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm h-64 animate-pulse" />
      </div>
    );
  }

  const totalTicketsSold = events.reduce((sum, e) => sum + e.ticketsSold, 0);
  const totalCapacity = events.reduce((sum, e) => sum + e.totalTickets, 0);
  const capacityFilled =
    totalCapacity > 0 ? Math.round((totalTicketsSold / totalCapacity) * 100) : 0;

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
            <p className="text-sm text-[#6B597F]">Total Events</p>
            <p className="text-2xl font-bold text-[#29104A]">0</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
            <p className="text-sm text-[#6B597F]">Total Tickets Sold</p>
            <p className="text-2xl font-bold text-[#29104A]">0</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
            <p className="text-sm text-[#6B597F]">Capacity Filled</p>
            <p className="text-2xl font-bold text-[#522C5D]">0%</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#29104A] mb-2">All Events</h2>
          <p className="text-sm text-[#6B597F]">No events found for this fest.</p>
        </div>
      </div>
    );
  }

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
            {totalTicketsSold.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Capacity Filled</p>
          <p className="text-2xl font-bold text-[#522C5D]">
            {capacityFilled}%
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
