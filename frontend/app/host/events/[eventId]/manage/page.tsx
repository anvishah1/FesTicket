"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Footer from "@/components/Footer";
import { getApiUrl, getStoredUser } from "@/lib/auth";

interface TicketType {
  name: string;
  price: number;
  sold: number;
  total: number;
}

interface TicketBuyer {
  id: number;
  name: string;
  email: string;
  phone: string;
  ticketType: string;
  quantity: number;
  amountPaid: number;
  purchaseDate: string;
  bookingId: string;
}

interface SalesDataPoint {
  date: string;
  tickets: number;
  revenue: number;
}

interface EventDetails {
  id: number;
  name: string;
  date: string;
  time: string;
  venue: string;
  venueAddress: string;
  description: string;
  image: string;
  category: string;
  status: "upcoming" | "past" | "live";
  ticketTypes: TicketType[];
  discount: number;
  totalRevenue: number;
  salesData: SalesDataPoint[];
  buyers: TicketBuyer[];
}

// Convert various time representations coming from the API into a value
// that works nicely with `<input type="time">` (HH:MM).
function toTimeInputValue(value?: string | null): string {
  if (!value) return "";
  // If it's already in HH:MM or HH:MM:SS, just return it.
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}

export default function ManageEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = Number(params.eventId);
  const user = getStoredUser();
  const isAdmin = user?.role === "ADMIN";

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "buyers">("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    date: "",
    time: "",
    venue: "",
    venueAddress: "",
    description: "",
    category: "",
  });

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const [eventRes, bookingsRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/events/${eventId}`),
          fetch(`${getApiUrl()}/api/bookings/event/${eventId}`),
        ]);
        const eventData = await eventRes.json();
        const bookingsData = await bookingsRes.json();

        if (!eventRes.ok || !eventData.success || !eventData.data) {
          setEvent(null);
          setLoading(false);
          return;
        }

        const ev = eventData.data;
        const bookings = bookingsData.success && bookingsData.data?.bookings ? bookingsData.data.bookings : [];
        const stats = bookingsData.success && bookingsData.data?.stats ? bookingsData.data.stats : { totalRevenue: 0, totalTicketsSold: 0 };

        const completed = bookings.filter((b: { status: string }) => b.status === "COMPLETED");

        // Build buyers from completed bookings (scoped to this event)
        const buyers: TicketBuyer[] = completed.map((b: any) => ({
          id: b.id,
          bookingId: b.bookingCode,
          name: b.buyerName || "Guest",
          email: b.buyerEmail || "",
          phone: b.buyerPhone || "",
          ticketType: b.tickets?.map((t: any) => t.type).join(", ") || "—",
          quantity: b.totalTickets ?? 0,
          amountPaid: b.total ?? 0,
          purchaseDate: b.purchaseDate
            ? new Date(b.purchaseDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
            : "—",
        }));

        // Build salesData: group completed bookings by date, sum tickets and revenue
        const byDate: Record<string, { tickets: number; revenue: number }> = {};
        for (const b of completed) {
          const dateKey = b.purchaseDate
            ? new Date(b.purchaseDate).toISOString().slice(0, 10)
            : new Date(b.createdAt).toISOString().slice(0, 10);
          if (!byDate[dateKey]) byDate[dateKey] = { tickets: 0, revenue: 0 };
          byDate[dateKey].tickets += b.totalTickets ?? 0;
          byDate[dateKey].revenue += b.total ?? 0;
        }
        const salesData: SalesDataPoint[] = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dateKey, { tickets, revenue }]) => ({
            date: new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            tickets,
            revenue,
          }));

        // Per-ticket-type sold from completed bookings only (so breakdown matches payments)
        const soldByTypeName: Record<string, number> = {};
        for (const b of completed) {
          for (const t of b.tickets || []) {
            const name = t.type || "—";
            soldByTypeName[name] = (soldByTypeName[name] ?? 0) + (t.quantity ?? 0);
          }
        }

        const ticketTypes = (ev.ticketTypes || []).map((t: any) => ({
          name: t.name,
          price: t.price,
          sold: soldByTypeName[t.name] ?? t.sold ?? 0,
          total: t.quantity ?? 0,
        }));

        const mappedEvent: EventDetails = {
          id: ev.id,
          name: ev.name,
          date: ev.startDate
            ? new Date(ev.startDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "TBA",
          time: ev.startTime || "TBA",
          venue: ev.venue || "TBA",
          venueAddress: ev.venueAddress || "",
          description: ev.description || ev.shortDescription || "",
          image:
            ev.image ||
            "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=600&fit=crop",
          category: ev.category || "Event",
          status: "upcoming",
          ticketTypes,
          discount: ev.discount || 0,
          totalRevenue: stats.totalRevenue ?? 0,
          salesData,
          buyers,
        };

        setEvent(mappedEvent);
        setEditForm({
          name: ev.name,
          date: ev.startDate ? new Date(ev.startDate).toISOString().slice(0, 10) : "",
          time: toTimeInputValue(ev.startTime),
          venue: ev.venue || "TBA",
          venueAddress: ev.venueAddress || "",
          description: ev.description || ev.shortDescription || "",
          category: ev.category || "Event",
        });
      } catch (error) {
        console.error("Failed to fetch event data:", error);
        setEvent(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEventData();
  }, [eventId]);

  const handleSaveChanges = async () => {
    if (!event) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          category: editForm.category,
          venue: editForm.venue,
          venueAddress: editForm.venueAddress,
          // Persist date & time back to the DB so that the public
          // event details page reflects these edits too.
          startDate: editForm.date || null,
          startTime: editForm.time || null,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.error?.message || "Failed to update event");
        return;
      }

      const updated = data.data;
      setEvent({
        ...event,
        name: updated.name,
        description: updated.description || updated.shortDescription || "",
        venue: updated.venue || "",
        venueAddress: updated.venueAddress || "",
        category: updated.category || "Event",
        date: updated.startDate
          ? new Date(updated.startDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : event.date,
        time: updated.startTime || event.time,
      });
      setIsEditing(false);
      alert("Changes saved successfully!");
    } catch (err) {
      console.error("Failed to update event:", err);
      alert("Failed to update event. Please try again.");
    }
  };

  const getTotalTicketsSold = () => {
    if (!event) return 0;
    return event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
  };

  const handleExportExcel = () => {
    if (!event) return;
    const headers = ["Booking ID", "Buyer", "Email", "Phone", "Ticket Type", "Qty", "Amount Paid (₹)", "Date"];
    const rows = event.buyers.map((b) => [
      b.bookingId,
      b.name,
      b.email,
      b.phone || "",
      b.ticketType,
      b.quantity,
      b.amountPaid,
      b.purchaseDate,
    ]);
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ticket Buyers");
    const safeName = event.name.replace(/[^\w\s-]/g, "").slice(0, 30) || "event";
    XLSX.writeFile(wb, `${safeName}-ticket-buyers.xlsx`);
  };

  const getTotalTickets = () => {
    if (!event) return 0;
    return event.ticketTypes.reduce((sum, t) => sum + t.total, 0);
  };

  const maxTickets =
    event && event.salesData.length > 0
      ? Math.max(1, ...event.salesData.map((d) => d.tickets))
      : 1;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fdfdff]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-[#C5BAC4] rounded w-48"></div>
            <div className="h-64 bg-[#C5BAC4] rounded-xl"></div>
            <div className="h-96 bg-[#C5BAC4] rounded-xl"></div>
          </div>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-[#fdfdff] text-[#29104A] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6B597F] text-lg">Event not found</p>
          <button
            onClick={() => router.push("/host/dashboard")}
            className="mt-4 text-[#522C5D] hover:text-[#29104A]"
          >
            ← Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fdfdff] text-[#29104A]">
      {/* Header */}
      <header className="border-b border-[#C5BAC4] bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {!isAdmin && (
              <button
                onClick={() => router.push("/host/dashboard")}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5 text-white/80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div>
              <h1 className="font-bold text-lg text-white">Manage Event</h1>
              <p className="text-xs text-white/70">{event.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                event.status === "upcoming"
                  ? "bg-white/20 text-white"
                  : event.status === "live"
                  ? "bg-green-500/20 text-green-300"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </span>
          </div>
        </div>
      </header>
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="flex items-center gap-2 rounded-lg border border-[#C5BAC4] bg-white px-4 py-2 text-sm font-medium text-[#29104A] hover:bg-[#F5F1F8] transition"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>

            Back to Admin Dashboard
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Event Header Card */}
        <div className="bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden mb-8 shadow-sm">
          <div className="flex flex-col lg:flex-row">
            {/* Event Image */}
            <div className="lg:w-80 h-48 lg:h-auto flex-shrink-0">
              <img
                src={event.image}
                alt={event.name}
                className="w-full h-full object-cover"
              />
            </div>
            {/* Event Info */}
            <div className="flex-1 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="text-2xl font-bold bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-lg px-3 py-1 w-full text-[#29104A]"
                    />
                  ) : (
                    <h2 className="text-2xl font-bold text-[#29104A]">{event.name}</h2>
                  )}
                  <p className="text-[#6B597F] mt-1">{event.category}</p>
                </div>
                <button
                  onClick={() => isEditing ? handleSaveChanges() : setIsEditing(true)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    isEditing
                      ? "bg-[#522C5D] hover:bg-[#29104A] text-white"
                      : "bg-[#C5BAC4]/30 hover:bg-[#C5BAC4] text-[#29104A]"
                  }`}
                >
                  {isEditing ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Changes
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Event
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#C5BAC4]/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        className="bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-lg px-3 py-1 text-sm flex-1 text-[#29104A]"
                      />
                    ) : (
                      <span className="text-[#29104A]">{event.date}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#C5BAC4]/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="time"
                        value={editForm.time}
                        onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                        className="bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-lg px-3 py-1 text-sm flex-1 text-[#29104A]"
                      />
                    ) : (
                      <span className="text-[#29104A]">{event.time}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#C5BAC4]/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.venue}
                        onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                        className="bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-lg px-3 py-1 text-sm flex-1 text-[#29104A]"
                      />
                    ) : (
                      <span className="text-[#29104A]">{event.venue}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#C5BAC4]/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-lg px-3 py-1 text-sm flex-1 text-[#29104A]"
                      />
                    ) : (
                      <span className="text-[#29104A]">{event.category}</span>
                    )}
                  </div>
                </div>
              </div>

              {isEditing && (
                <div className="mt-4">
                  <label className="text-sm text-[#6B597F] mb-1 block">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-[#C5BAC4]/20 border border-[#C5BAC4] rounded-lg px-3 py-2 text-sm resize-none h-20 text-[#29104A]"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-5 shadow-sm">
            <p className="text-[#6B597F] text-sm mb-1">Total Revenue</p>
            <p className="text-2xl font-bold text-[#29104A]">₹{event.totalRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-5 shadow-sm">
            <p className="text-[#6B597F] text-sm mb-1">Tickets Sold</p>
            <p className="text-2xl font-bold text-[#522C5D]">{getTotalTicketsSold()} / {getTotalTickets()}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-5 shadow-sm">
            <p className="text-[#6B597F] text-sm mb-1">Discount Active</p>
            <p className="text-2xl font-bold text-[#522C5D]">{event.discount > 0 ? `${event.discount}%` : "None"}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C5BAC4] p-5 shadow-sm">
            <p className="text-[#6B597F] text-sm mb-1">Total Buyers</p>
            <p className="text-2xl font-bold text-[#29104A]">{event.buyers.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-[#522C5D] text-white"
                : "bg-[#C5BAC4]/30 text-[#6B597F] hover:bg-[#C5BAC4]"
            }`}
          >
            Overview & Sales
          </button>
          <button
            onClick={() => setActiveTab("buyers")}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
              activeTab === "buyers"
                ? "bg-[#522C5D] text-white"
                : "bg-[#C5BAC4]/30 text-[#6B597F] hover:bg-[#C5BAC4]"
            }`}
          >
            Ticket Buyers
          </button>
        </div>

        {activeTab === "overview" && (
          <>
            {/* Sales Graph */}
            <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 mb-8 shadow-sm">
              <h3 className="text-lg font-bold mb-6 text-[#29104A]">Tickets Sold Over Time</h3>

              {event.salesData.length === 0 ? (
                <div className="flex items-center justify-center h-64 border border-[#C5BAC4] rounded-lg bg-[#C5BAC4]/5">
                  <p className="text-[#6B597F]">No sales yet. Completed payments will appear here.</p>
                </div>
              ) : (
                <div className="relative h-64">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-xs text-[#6B597F]">
                    <span>{maxTickets}</span>
                    <span>{Math.round(maxTickets * 0.75)}</span>
                    <span>{Math.round(maxTickets * 0.5)}</span>
                    <span>{Math.round(maxTickets * 0.25)}</span>
                    <span>0</span>
                  </div>

                  {/* Chart Area */}
                  <div className="ml-14 h-full flex items-end gap-2 pb-8 border-l border-b border-[#C5BAC4]">
                    {event.salesData.map((data, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center group">
                        <div className="relative w-full flex justify-center">
                          <div
                            className="w-8 bg-gradient-to-t from-[#1A4B6E] to-[#2E6B8A] rounded-t-md transition-all duration-300 group-hover:from-[#2E6B8A] group-hover:to-[#4A8BA8]"
                            style={{ height: `${(data.tickets / maxTickets) * 180}px` }}
                          />
                          <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-[#1A4B6E] border border-[#2E6B8A] rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            <p className="font-semibold text-white">{data.tickets} tickets</p>
                            <p className="text-[#C5BAC4]">₹{data.revenue.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* X-axis labels */}
                  <div className="ml-14 flex gap-2 mt-2">
                    {event.salesData.map((data, index) => (
                      <div key={index} className="flex-1 text-center text-xs text-[#6B597F]">
                        {data.date}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ticket Types Breakdown */}
            <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6 text-[#29104A]">Ticket Types Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {event.ticketTypes.map((ticket, index) => (
                  <div key={index} className="bg-[#C5BAC4]/20 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-[#29104A]">{ticket.name}</span>
                      <span className="text-[#522C5D] font-bold">₹{ticket.price}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#6B597F]">Sold</span>
                        <span className="text-[#29104A]">{ticket.sold} / {ticket.total}</span>
                      </div>
                      <div className="w-full h-2 bg-[#C5BAC4] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#522C5D] rounded-full"
                          style={{ width: `${ticket.total ? (ticket.sold / ticket.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#6B597F]">Revenue</span>
                        <span className="text-[#29104A] font-medium">
                          ₹{(ticket.sold * ticket.price * (1 - event.discount / 100)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === "buyers" && (
          <div className="bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-[#C5BAC4] flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#29104A]">Ticket Buyers ({event.buyers.length})</h3>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-4 py-2 bg-[#C5BAC4]/30 hover:bg-[#C5BAC4] rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-[#29104A]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Excel
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#C5BAC4]/20">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Booking ID</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Buyer</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Contact</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Ticket Type</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Qty</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Amount Paid</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C5BAC4]">
                  {event.buyers.map((buyer) => (
                    <tr key={buyer.id} className="hover:bg-[#C5BAC4]/10 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-[#522C5D]">{buyer.bookingId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-[#29104A]">{buyer.name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-[#29104A]">{buyer.email}</p>
                        <p className="text-xs text-[#6B597F]">{buyer.phone}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          buyer.ticketType === "VVIP"
                            ? "bg-[#29104A]/10 text-[#29104A]"
                            : buyer.ticketType === "VIP"
                            ? "bg-[#522C5D]/10 text-[#522C5D]"
                            : "bg-[#C5BAC4]/30 text-[#6B597F]"
                        }`}>
                          {buyer.ticketType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#29104A]">{buyer.quantity}</td>
                      <td className="px-6 py-4">
                        <span className="text-[#29104A] font-bold">₹{buyer.amountPaid.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#6B597F]">{buyer.purchaseDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}





