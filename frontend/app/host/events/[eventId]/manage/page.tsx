"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

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

// Sample event data
const sampleEventDetails: EventDetails = {
  id: 1,
  name: "Proshow Day 1",
  date: "Feb 14, 2025",
  time: "7:00 PM - 11:00 PM",
  venue: "Main Ground",
  venueAddress: "NIT Calicut Campus, Kozhikode, Kerala 673601, India",
  description: "Opening night featuring top artists. Get ready for an electrifying evening with the biggest names in music!",
  image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=600&fit=crop",
  category: "Entertainment",
  status: "upcoming",
  ticketTypes: [
    { name: "General", price: 999, sold: 450, total: 1000 },
    { name: "VIP", price: 2499, sold: 85, total: 100 },
    { name: "VVIP", price: 4999, sold: 20, total: 25 },
  ],
  discount: 10,
  totalRevenue: 789525,
  salesData: [
    { date: "Dec 1", tickets: 45, revenue: 52000 },
    { date: "Dec 2", tickets: 62, revenue: 71000 },
    { date: "Dec 3", tickets: 38, revenue: 44000 },
    { date: "Dec 4", tickets: 89, revenue: 102000 },
    { date: "Dec 5", tickets: 124, revenue: 145000 },
    { date: "Dec 6", tickets: 78, revenue: 89000 },
    { date: "Dec 7", tickets: 95, revenue: 108000 },
    { date: "Dec 8", tickets: 67, revenue: 76000 },
    { date: "Dec 9", tickets: 42, revenue: 48000 },
    { date: "Dec 10", tickets: 15, revenue: 54525 },
  ],
  buyers: [
    { id: 1, name: "Rahul Sharma", email: "rahul.sharma@email.com", phone: "+91 98765 43210", ticketType: "VIP", quantity: 2, amountPaid: 4498, purchaseDate: "Dec 10, 2024", bookingId: "TKT-001234" },
    { id: 2, name: "Priya Nair", email: "priya.n@email.com", phone: "+91 87654 32109", ticketType: "General", quantity: 4, amountPaid: 3596, purchaseDate: "Dec 10, 2024", bookingId: "TKT-001235" },
    { id: 3, name: "Arun Kumar", email: "arun.k@email.com", phone: "+91 76543 21098", ticketType: "VVIP", quantity: 1, amountPaid: 4499, purchaseDate: "Dec 9, 2024", bookingId: "TKT-001230" },
    { id: 4, name: "Sneha Menon", email: "sneha.m@email.com", phone: "+91 65432 10987", ticketType: "General", quantity: 2, amountPaid: 1798, purchaseDate: "Dec 9, 2024", bookingId: "TKT-001228" },
    { id: 5, name: "Vishnu Prasad", email: "vishnu.p@email.com", phone: "+91 54321 09876", ticketType: "VIP", quantity: 3, amountPaid: 6747, purchaseDate: "Dec 8, 2024", bookingId: "TKT-001220" },
    { id: 6, name: "Anjali Krishnan", email: "anjali.k@email.com", phone: "+91 43210 98765", ticketType: "General", quantity: 5, amountPaid: 4495, purchaseDate: "Dec 8, 2024", bookingId: "TKT-001218" },
    { id: 7, name: "Mohammed Faisal", email: "faisal.m@email.com", phone: "+91 32109 87654", ticketType: "VVIP", quantity: 2, amountPaid: 8998, purchaseDate: "Dec 7, 2024", bookingId: "TKT-001210" },
    { id: 8, name: "Lakshmi Devi", email: "lakshmi.d@email.com", phone: "+91 21098 76543", ticketType: "General", quantity: 3, amountPaid: 2697, purchaseDate: "Dec 7, 2024", bookingId: "TKT-001205" },
    { id: 9, name: "Suresh Babu", email: "suresh.b@email.com", phone: "+91 10987 65432", ticketType: "VIP", quantity: 1, amountPaid: 2249, purchaseDate: "Dec 6, 2024", bookingId: "TKT-001198" },
    { id: 10, name: "Deepa Rajan", email: "deepa.r@email.com", phone: "+91 09876 54321", ticketType: "General", quantity: 2, amountPaid: 1798, purchaseDate: "Dec 5, 2024", bookingId: "TKT-001190" },
  ],
};

export default function ManageEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = Number(params.eventId);

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
    // TODO: Replace with API call
    setEvent(sampleEventDetails);
    setEditForm({
      name: sampleEventDetails.name,
      date: sampleEventDetails.date,
      time: sampleEventDetails.time,
      venue: sampleEventDetails.venue,
      venueAddress: sampleEventDetails.venueAddress,
      description: sampleEventDetails.description,
      category: sampleEventDetails.category,
    });
    setLoading(false);
  }, [eventId]);

  const handleSaveChanges = () => {
    // TODO: API call to save changes
    if (event) {
      setEvent({
        ...event,
        ...editForm,
      });
    }
    setIsEditing(false);
    alert("Changes saved successfully!");
  };

  const getTotalTicketsSold = () => {
    if (!event) return 0;
    return event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
  };

  const getTotalTickets = () => {
    if (!event) return 0;
    return event.ticketTypes.reduce((sum, t) => sum + t.total, 0);
  };

  const maxTickets = event ? Math.max(...event.salesData.map((d) => d.tickets)) : 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f0f1a]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-800 rounded w-48"></div>
            <div className="h-64 bg-gray-800 rounded-xl"></div>
            <div className="h-96 bg-gray-800 rounded-xl"></div>
          </div>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-[#0f0f1a] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Event not found</p>
          <button
            onClick={() => router.push("/host/dashboard")}
            className="mt-4 text-amber-400 hover:text-amber-300"
          >
            ← Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0f1a] text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0f0f1a]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/host/dashboard")}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="font-bold text-lg">Manage Event</h1>
              <p className="text-xs text-gray-400">{event.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                event.status === "upcoming"
                  ? "bg-blue-500/20 text-blue-400"
                  : event.status === "live"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-gray-600/20 text-gray-400"
              }`}
            >
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Event Header Card */}
        <div className="bg-[#1a1a2e] rounded-2xl border border-gray-800 overflow-hidden mb-8">
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
                      className="text-2xl font-bold bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 w-full"
                    />
                  ) : (
                    <h2 className="text-2xl font-bold">{event.name}</h2>
                  )}
                  <p className="text-gray-400 mt-1">{event.category}</p>
                </div>
                <button
                  onClick={() => isEditing ? handleSaveChanges() : setIsEditing(true)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    isEditing
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-gray-300"
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
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-sm flex-1"
                      />
                    ) : (
                      <span className="text-gray-300">{event.date}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.time}
                        onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-sm flex-1"
                      />
                    ) : (
                      <span className="text-gray-300">{event.time}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.venue}
                        onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-sm flex-1"
                      />
                    ) : (
                      <span className="text-gray-300">{event.venue}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-sm flex-1"
                      />
                    ) : (
                      <span className="text-gray-300">{event.category}</span>
                    )}
                  </div>
                </div>
              </div>

              {isEditing && (
                <div className="mt-4">
                  <label className="text-sm text-gray-400 mb-1 block">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none h-20"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800 p-5">
            <p className="text-gray-400 text-sm mb-1">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">₹{event.totalRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800 p-5">
            <p className="text-gray-400 text-sm mb-1">Tickets Sold</p>
            <p className="text-2xl font-bold text-amber-400">{getTotalTicketsSold()} / {getTotalTickets()}</p>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800 p-5">
            <p className="text-gray-400 text-sm mb-1">Discount Active</p>
            <p className="text-2xl font-bold text-red-400">{event.discount > 0 ? `${event.discount}%` : "None"}</p>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl border border-gray-800 p-5">
            <p className="text-gray-400 text-sm mb-1">Total Buyers</p>
            <p className="text-2xl font-bold text-blue-400">{event.buyers.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-amber-500 text-black"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Overview & Sales
          </button>
          <button
            onClick={() => setActiveTab("buyers")}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
              activeTab === "buyers"
                ? "bg-amber-500 text-black"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Ticket Buyers
          </button>
        </div>

        {activeTab === "overview" && (
          <>
            {/* Sales Graph */}
            <div className="bg-[#1a1a2e] rounded-2xl border border-gray-800 p-6 mb-8">
              <h3 className="text-lg font-bold mb-6">Tickets Sold Over Time</h3>
              
              {/* Graph Container */}
              <div className="relative h-64">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-xs text-gray-500">
                  <span>{maxTickets}</span>
                  <span>{Math.round(maxTickets * 0.75)}</span>
                  <span>{Math.round(maxTickets * 0.5)}</span>
                  <span>{Math.round(maxTickets * 0.25)}</span>
                  <span>0</span>
                </div>
                
                {/* Chart Area */}
                <div className="ml-14 h-full flex items-end gap-2 pb-8 border-l border-b border-gray-700">
                  {event.salesData.map((data, index) => (
                    <div key={index} className="flex-1 flex flex-col items-center group">
                      {/* Bar */}
                      <div className="relative w-full flex justify-center">
                        <div
                          className="w-8 bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-md transition-all duration-300 group-hover:from-amber-400 group-hover:to-amber-300"
                          style={{ height: `${(data.tickets / maxTickets) * 180}px` }}
                        ></div>
                        {/* Tooltip */}
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          <p className="font-semibold text-white">{data.tickets} tickets</p>
                          <p className="text-gray-400">₹{data.revenue.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* X-axis labels */}
                <div className="ml-14 flex gap-2 mt-2">
                  {event.salesData.map((data, index) => (
                    <div key={index} className="flex-1 text-center text-xs text-gray-500">
                      {data.date}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ticket Types Breakdown */}
            <div className="bg-[#1a1a2e] rounded-2xl border border-gray-800 p-6">
              <h3 className="text-lg font-bold mb-6">Ticket Types Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {event.ticketTypes.map((ticket, index) => (
                  <div key={index} className="bg-gray-800/50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-white">{ticket.name}</span>
                      <span className="text-amber-400 font-bold">₹{ticket.price}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Sold</span>
                        <span className="text-white">{ticket.sold} / {ticket.total}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(ticket.sold / ticket.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Revenue</span>
                        <span className="text-emerald-400 font-medium">
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
          <div className="bg-[#1a1a2e] rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">Ticket Buyers ({event.buyers.length})</h3>
              <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/50">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Booking ID</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Buyer</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Contact</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Ticket Type</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Qty</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Amount Paid</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {event.buyers.map((buyer) => (
                    <tr key={buyer.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-amber-400">{buyer.bookingId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-white">{buyer.name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-300">{buyer.email}</p>
                        <p className="text-xs text-gray-500">{buyer.phone}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          buyer.ticketType === "VVIP"
                            ? "bg-purple-500/20 text-purple-400"
                            : buyer.ticketType === "VIP"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-gray-600/20 text-gray-400"
                        }`}>
                          {buyer.ticketType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-white">{buyer.quantity}</td>
                      <td className="px-6 py-4">
                        <span className="text-emerald-400 font-bold">₹{buyer.amountPaid.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">{buyer.purchaseDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}





