'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { getApiUrl, getStoredUser, isAuthenticated, logout, apiFetch } from '@/lib/auth';

interface TicketType {
  name: string;
  price: number;
  sold: number;
  total: number;
}

interface Fest {
  id: number;
  name: string;
  college: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  events: HostEvent[];
  _count?: { events: number };
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
  discount: number;
  totalRevenue: number;
}

// Map API event (from GET /api/fests/:id) to HostEvent
function mapApiEventToHostEvent(e: any): HostEvent {
  const statusMap: Record<string, "upcoming" | "past" | "live"> = {
    PUBLISHED: "upcoming",
    UPCOMING: "upcoming",
    LIVE: "live",
    PAST: "past",
    DRAFT: "upcoming",
    CANCELLED: "past",
  };
  const totalRevenue =
    e.ticketTypes?.reduce((sum: number, t: any) => sum + (t.sold || 0) * (t.price || 0), 0) ?? 0;
  return {
    id: e.id,
    name: e.name,
    date: e.startDate
      ? new Date(e.startDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "TBA",
    time: e.startTime || "TBA",
    venue: e.venue || "TBA",
    image:
      e.image ||
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
    category: e.category || "Event",
    status: statusMap[e.effectiveStatus ?? e.status] ?? "upcoming",
    ticketTypes:
      e.ticketTypes?.map((t: any) => ({
        name: t.name,
        price: t.price,
        sold: t.sold ?? 0,
        total: t.quantity ?? 0,
      })) ?? [],
    discount: e.discount ?? 0,
    totalRevenue,
  };
}

export default function HostDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [fests, setFests] = useState<Fest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFest, setExpandedFest] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "past">("all");

  // Fest creation modal state
  const [showCreateFest, setShowCreateFest] = useState(false);
  const [festForm, setFestForm] = useState({
    name: "",
    college: "",
    description: "",
    image: "",
    startDate: "",
    endDate: "",
  });
  const [festImagePreview, setFestImagePreview] = useState<string | null>(null);
  const [creatingFest, setCreatingFest] = useState(false);
  const [festError, setFestError] = useState("");
  const [festSuccess, setFestSuccess] = useState(false);
  const [editingFestId, setEditingFestId] = useState<number | null>(null);

  const user = getStoredUser();
  // Editor's linked fest (same festID as admin and the fest); no fallback so we only create events for their fest
  const editorFestId = user?.editorFestId ?? null;
  const createEventFestId = editorFestId;

  useEffect(() => {
    // Only EDITOR/HOST roles can access the host dashboard.
    // (AuthForm routes both roles here on login, so the guard must admit both.)
    if (!isAuthenticated() || !user || !["EDITOR", "HOST"].includes(user.role)) {
      router.replace("/signin");
    } else {
      setAuthChecked(true);
    }
  }, [router, user]);

  const fetchFests = async () => {
    // If this editor isn't linked to any fest yet, don't try to load one
    if (!editorFestId) {
      setFests([]);
      setLoading(false);
      return;
    }
    try {
      // Fetch fest details (name, etc.)
      const festRes = await fetch(`${getApiUrl()}/api/fests/${editorFestId}`);
      const festJson = await festRes.json();
      if (!festJson.success || !festJson.data) {
        setFests([]);
        setLoading(false);
        return;
      }
      const fest = festJson.data;
      // Fetch all events for this fest (same fest id as the user's)
      const eventsRes = await apiFetch(`${getApiUrl()}/api/events?festId=${editorFestId}`);
      const eventsJson = await eventsRes.json();
      const apiEvents = eventsJson.success ? (eventsJson.data ?? []) : [];
      const mappedEvents: HostEvent[] = apiEvents.map((e: any) => mapApiEventToHostEvent(e));
      const singleFest: Fest = {
        id: fest.id,
        name: fest.name,
        college: fest.college ?? "",
        description: fest.description ?? null,
        startDate: fest.startDate ?? null,
        endDate: fest.endDate ?? null,
        events: mappedEvents,
        _count: { events: mappedEvents.length },
      };
      setFests([singleFest]);
      setExpandedFest(singleFest.id);
    } catch (err) {
      console.error("Failed to fetch fest:", err);
      setFests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authChecked) {
      fetchFests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, editorFestId]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdff]">
        <p className="text-[#6B597F]">Loading...</p>
      </div>
    );
  }

  const handleSignOut = async () => {
    await logout();
    router.replace("/signin");
  };

  const handleCreateFest = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingFest(true);
    setFestError("");

    try {
      const isEdit = editingFestId !== null;
      const url = isEdit
        ? `${getApiUrl()}/api/fests/${editingFestId}`
        : `${getApiUrl()}/api/fests`;
      const method = isEdit ? "PUT" : "POST";

      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: festForm.name,
          college: festForm.college,
          description: festForm.description || null,
          image: festForm.image || null,
          startDate: festForm.startDate || null,
          endDate: festForm.endDate || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setFestSuccess(true);
        setTimeout(() => {
          setShowCreateFest(false);
          setFestForm({ name: "", college: "", description: "", image: "", startDate: "", endDate: "" });
          setFestImagePreview(null);
          setFestSuccess(false);
          setEditingFestId(null);
          fetchFests();
        }, 1500);
      } else {
        setFestError(data.error || "Failed to save fest");
      }
    } catch {
      setFestError("Failed to connect to server. Make sure backend is running.");
    } finally {
      setCreatingFest(false);
    }
  };

  const formatDate = (startDate: string | null, endDate: string | null) => {
    if (!startDate) return "Dates TBA";
    const start = new Date(startDate);
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    if (endDate) {
      const end = new Date(endDate);
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", options)}`;
    }
    return start.toLocaleDateString("en-US", options);
  };

  const getTotalTicketsSold = (event: HostEvent) => {
    return event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
  };

  const getTotalTickets = (event: HostEvent) => {
    return event.ticketTypes.reduce((sum, t) => sum + t.total, 0);
  };

  const getFilteredEvents = (events: HostEvent[]) => {
    if (activeTab === "all") return events;
    return events.filter((e) => e.status === activeTab);
  };

  // Calculate global stats
  const allEvents = fests.flatMap((f) => f.events || []);
  const totalRevenue = allEvents.reduce((sum, e) => sum + e.totalRevenue, 0);
  const totalTicketsSold = allEvents.reduce((sum, e) => sum + getTotalTicketsSold(e), 0);
  const upcomingEventsCount = allEvents.filter((e) => e.status === "upcoming").length;

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
              <p className="text-xs text-[#C5BAC4]">{fests[0]?.college ?? fests[0]?.name ?? "Your fest"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/host/marketing")}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 border border-white/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Marketing
            </button>
            <button
              onClick={() => createEventFestId != null && router.push(`/host/fests/${createEventFestId}/events/create`)}
              disabled={createEventFestId == null}
              className="px-4 py-2 bg-[#29104A] hover:bg-[#522C5D] text-white font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Event
            </button>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 border border-white/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1 text-[#29104A]">
            Welcome back, {user?.name?.trim() || user?.email?.split("@")[0] || "there"}! 👋
          </h2>
          <p className="text-[#6B597F]">
            Here's an overview of your fest and events.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Reserved Value</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">₹{totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-[#6B597F] mt-1">incl. pending holds</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Tickets Reserved</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">{totalTicketsSold.toLocaleString()}</p>
            <p className="text-xs text-[#6B597F] mt-1">incl. pending holds</p>
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
              <span className="text-[#6B597F] text-sm">Your Fest</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <p className="text-lg font-bold text-[#29104A] truncate">{fests[0]?.name ?? "—"}</p>
          </div>
        </div>

        {/* Events Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-[#29104A]">Your Events</h3>

          {fests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#C5BAC4] p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-[#C5BAC4]/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              {editorFestId ? (
                <>
                  <h4 className="text-lg font-bold text-[#29104A] mb-2">No events yet</h4>
                  <p className="text-[#6B597F] mb-4">Create your first event to get started.</p>
                  <button
                    onClick={() => router.push(`/host/fests/${createEventFestId}/events/create`)}
                    className="px-6 py-3 bg-[#522C5D] hover:bg-[#29104A] text-white font-semibold rounded-lg transition-colors"
                  >
                    Create Your First Event
                  </button>
                </>
              ) : (
                <>
                  <h4 className="text-lg font-bold text-[#29104A] mb-2">Not linked to a fest</h4>
                  <p className="text-[#6B597F]">Contact your admin to get access to your fest.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {fests.map((fest) => (
                <div key={fest.id} className="bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden shadow-sm">
                  {/* Fest Header */}
                  <div
                    className="p-5 cursor-pointer hover:bg-[#C5BAC4]/10 transition-colors"
                    onClick={() => setExpandedFest(expandedFest === fest.id ? null : fest.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#522C5D] to-[#29104A] flex items-center justify-center">
                          <span className="text-2xl font-bold text-white">{fest.name.charAt(0)}</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-[#29104A]">{fest.name}</h4>
                          <p className="text-sm text-[#6B597F]">{fest.college}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Editing the fest is an ADMIN-only action (PUT /api/fests/:id).
                            Hosts/editors can't perform it, so we don't show a control
                            that would always fail — fest edits happen from the admin
                            dashboard. */}
                        <div className="text-right hidden sm:block">
                          <p className="text-sm text-[#6B597F]">{formatDate(fest.startDate, fest.endDate)}</p>
                          <p className="text-sm font-medium text-[#522C5D]">
                            {fest.events?.length || 0} events
                          </p>
                        </div>
                        <svg
                          className={`w-5 h-5 text-[#6B597F] transition-transform ${expandedFest === fest.id ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    {fest.description && (
                      <p className="text-sm text-[#6B597F] mt-2 line-clamp-1">{fest.description}</p>
                    )}
                  </div>

                  {/* Expanded Content - Full Events Table */}
                  {expandedFest === fest.id && (
                    <div className="border-t border-[#C5BAC4]">
                      {/* Table Header with Tabs */}
                      <div className="px-6 py-5 border-b border-[#C5BAC4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#fdfdff]">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold text-[#29104A]">Events in {fest.name}</h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/host/fests/${fest.id}/events/create`);
                            }}
                            className="px-3 py-1.5 bg-[#522C5D] hover:bg-[#29104A] text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Event
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {(["all", "upcoming", "past"] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab(tab);
                              }}
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

                      {/* Events Table */}
                      {(!fest.events || fest.events.length === 0) ? (
                        <div className="text-center py-12 bg-[#fdfdff]">
                          <svg className="w-12 h-12 text-[#C5BAC4] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-[#6B597F] mb-3">No events yet in this fest</p>
                          <button
                            onClick={() => router.push(`/host/fests/${fest.id}/events/create`)}
                            className="text-[#522C5D] hover:text-[#29104A] font-medium text-sm"
                          >
                            + Create your first event
                          </button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-[#C5BAC4]/20">
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Event</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Date & Time</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Tickets Reserved</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Ticket Types</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Discount</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Reserved Value</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Status</th>
                                <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#C5BAC4]">
                              {getFilteredEvents(fest.events).map((event) => (
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
                                          width: `${Math.min(100, getTotalTickets(event) ? (getTotalTicketsSold(event) / getTotalTickets(event)) * 100 : 0)}%`,
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/host/events/${event.id}/manage`);
                                      }}
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

                          {getFilteredEvents(fest.events).length === 0 && (
                            <div className="px-6 py-12 text-center">
                              <p className="text-[#6B597F]">No {activeTab} events found.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />

      {/* Create Fest Modal */}
      {showCreateFest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#29104A]">{editingFestId !== null ? "Edit Fest" : "Create New Fest"}</h2>
              <button
                onClick={() => {
                  setShowCreateFest(false);
                  setFestError("");
                  setFestSuccess(false);
                  setEditingFestId(null);
                }}
                className="w-10 h-10 rounded-full bg-[#C5BAC4]/30 hover:bg-[#C5BAC4] transition-colors flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {festSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-[#29104A] mb-2">{editingFestId !== null ? "Fest Updated!" : "Fest Created!"}</h3>
                <p className="text-[#6B597F]">You can now add events to your fest.</p>
              </div>
            ) : (
              <form onSubmit={handleCreateFest} className="space-y-4">
                {festError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {festError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1">
                    Fest Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={festForm.name}
                    onChange={(e) => setFestForm({ ...festForm, name: e.target.value })}
                    placeholder="e.g., Tathva 2025"
                    className="w-full px-4 py-3 rounded-lg border border-[#C5BAC4] focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1">
                    College/Organization <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={festForm.college}
                    onChange={(e) => setFestForm({ ...festForm, college: e.target.value })}
                    placeholder="e.g., NIT Calicut"
                    className="w-full px-4 py-3 rounded-lg border border-[#C5BAC4] focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1">
                    Description
                  </label>
                  <textarea
                    value={festForm.description}
                    onChange={(e) => setFestForm({ ...festForm, description: e.target.value })}
                    placeholder="Brief description of your fest..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-[#C5BAC4] focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 outline-none transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1">
                    Fest Image
                  </label>
                  {festImagePreview && (
                    <div className="mb-3">
                      <img
                        src={festImagePreview}
                        alt="Fest preview"
                        className="w-full h-40 object-cover rounded-lg border border-[#C5BAC4]"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex items-center justify-center px-4 py-3 rounded-lg border border-dashed border-[#C5BAC4] text-sm text-[#6B597F] hover:border-[#522C5D] hover:text-[#522C5D] cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const result = reader.result as string;
                            setFestForm({ ...festForm, image: result });
                            setFestImagePreview(result);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <span>Upload from device</span>
                    </label>
                    <input
                      type="url"
                      value={festForm.image && festForm.image.startsWith("http") ? festForm.image : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFestForm({ ...festForm, image: value });
                        setFestImagePreview(value || null);
                      }}
                      placeholder="Or paste an image URL (optional)"
                      className="w-full px-4 py-3 rounded-lg border border-[#C5BAC4] focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 outline-none transition-all text-sm"
                    />
                  </div>
                  <p className="mt-1 text-xs text-[#6B597F]">
                    This image will appear on the public fests page.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#29104A] mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={festForm.startDate}
                      onChange={(e) => setFestForm({ ...festForm, startDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#C5BAC4] focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#29104A] mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={festForm.endDate}
                      onChange={(e) => setFestForm({ ...festForm, endDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-[#C5BAC4] focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFest(false);
                      setFestError("");
                    }}
                    className="flex-1 px-4 py-3 bg-[#C5BAC4]/30 hover:bg-[#C5BAC4] text-[#6B597F] font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingFest}
                    className="flex-1 px-4 py-3 bg-[#522C5D] hover:bg-[#29104A] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {creatingFest ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </>
                    ) : (
                      "Create Fest"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
