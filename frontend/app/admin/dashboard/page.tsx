"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl, getStoredUser, getAccessToken, isAuthenticated, updateStoredUser, apiFetch } from "@/lib/auth";
import { showToast } from "@/lib/toast";
import { formatPaise } from "@/lib/format";

import SalesTrendChart, { type TrendPoint } from "@/components/analytics/SalesTrendChart";
import RoleRequests from "@/components/admin/RoleRequests";
import FestEvents from "@/components/admin/FestEvents";
import Companies from "@/components/admin/Companies";
import Expenses from "@/components/admin/Expenses";
import CreateFest from "@/components/admin/CreateFest";

type AdminSection = "events" | "approvals" | "companies" | "expenses" | "createFest";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] =
    useState<AdminSection>("approvals");
  const [mounted, setMounted] = useState(false);
  const [festName, setFestName] = useState<string | null>(null);
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const [festKey, setFestKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [analytics, setAnalytics] = useState<{
    revenue: number;
    ticketsSold: number;
    eventsCount: number;
    bookingsCount: number;
  } | null>(null);
  const [totalSpend, setTotalSpend] = useState<number | null>(null);
  const [sponsorIncome, setSponsorIncome] = useState<number | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null); // ANL-01

  const managedFestId = user?.managedFestId ?? null;

  useEffect(() => {
    setMounted(true);
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated()) {
      router.replace("/admin/signin");
      return;
    }
    if (user && user.role !== "ADMIN") {
      router.replace("/admin/signin");
    }
  }, [mounted, router, user?.role]);

  // Always sync admin user from DB when dashboard loads (and /me can repair managedFestId if missing)
  useEffect(() => {
    if (!mounted) return;
    const token = getAccessToken();
    if (!token) return;
    // Enrichment call: don't let a stale token bounce an admin who is already
    // validly on the dashboard (via stored user) — fall through on auth failure.
    apiFetch(`${getApiUrl()}/api/user/me`, {}, { redirectOnAuthFailure: false })
      .then((r) => r.ok ? r.json() : null)
      .then((body) => {
        // Unified envelope: the user object is under `data`.
        const me = body?.data;
        if (!me) return;
        const managedFestId = me.managedFestId != null ? Number(me.managedFestId) : null;
        const editorFestId = me.editorFestId != null ? Number(me.editorFestId) : null;
        updateStoredUser({ managedFestId, editorFestId });
        setUser((prev) => (prev ? { ...prev, managedFestId, editorFestId } : { ...me, managedFestId, editorFestId }));
        // The student-facing fest key (adminKey) so the admin can share it. Per
        // contract, /api/user/me includes managedFest.adminKey for admins.
        if (me.managedFest?.adminKey) setFestKey(me.managedFest.adminKey);
      })
      .catch(() => {});
  }, [mounted]);

  useEffect(() => {
    if (!managedFestId) return;
    fetch(`${getApiUrl()}/api/fests/${managedFestId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.data?.name) setFestName(data.data.name);
      })
      .catch(() => {});
  }, [managedFestId]);

  // Fest-scoped financials: income/tickets/events/bookings from analytics, and
  // total spend from the fest-wide expenses (both fest-scoped, so the net is
  // correct even on multi-editor fests).
  useEffect(() => {
    if (!managedFestId) return;
    apiFetch(`${getApiUrl()}/api/events/analytics/fest/${managedFestId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.data) {
          setAnalytics({
            revenue: data.data.revenue ?? 0,
            ticketsSold: data.data.ticketsSold ?? 0,
            eventsCount: data.data.eventsCount ?? 0,
            bookingsCount: data.data.bookingsCount ?? 0,
          });
        }
      })
      .catch(() => {});

    // ANL-01: day-bucketed sales trend for the chart under the stat grid.
    apiFetch(`${getApiUrl()}/api/events/analytics/fest/${managedFestId}/timeseries`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.data?.points)) setTrend(data.data.points);
      })
      .catch(() => {});

    apiFetch(`${getApiUrl()}/api/events/marketing/fest/${managedFestId}/expenses`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setTotalSpend(
            data.data.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
          );
        }
      })
      .catch(() => {});

    // Sponsorship income actually received — folded into Net Balance so the
    // headline number reflects the Sponsors panel shown on the same dashboard.
    apiFetch(`${getApiUrl()}/api/events/marketing/fest/${managedFestId}/sponsors`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setSponsorIncome(
            data.data.reduce((sum: number, s: any) => sum + (s.receivedAmount || 0), 0)
          );
        }
      })
      .catch(() => {});
    // (The fest key comes from GET /api/user/me's managedFest.adminKey — there is
    // no /api/fests/:id/key endpoint, so no fallback fetch here.)
  }, [managedFestId]);

  const handleCopyKey = async () => {
    if (!festKey) return;
    try {
      await navigator.clipboard.writeText(festKey);
      setKeyCopied(true);
      showToast("Fest key copied to clipboard", "success");
      setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      showToast("Could not copy the fest key", "error");
    }
  };

  // Net Balance = net ticket revenue (already excludes platform fee + GST) +
  // sponsorship received − total spend.
  const netBalance =
    analytics != null || totalSpend != null || sponsorIncome != null
      ? (analytics?.revenue ?? 0) + (sponsorIncome ?? 0) - (totalSpend ?? 0)
      : null;

  if (!mounted || !isAuthenticated()) {
    return (
      <div className="min-h-screen bg-[var(--surface-tint)] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading...</p>
      </div>
    );
  }

  if (user && user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-tint)] flex flex-col">
      <Header />

      <div className="flex-1 flex">
        {/* Sidebar - fest oriented */}
        <aside className="w-64 bg-[var(--surface)] border-r border-[var(--border-card)] px-6 py-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center">
              <svg aria-hidden="true" className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Admin Panel</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {festName ? `Managing: ${festName}` : managedFestId != null ? `Fest #${managedFestId}` : "No fest assigned"}
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            <SidebarItem
              label="Role Approvals"
              icon={
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              active={activeSection === "approvals"}
              onClick={() => setActiveSection("approvals")}
            />

            <SidebarItem
              label="Events"
              icon={
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              active={activeSection === "events"}
              onClick={() => setActiveSection("events")}
            />

            <SidebarItem
              label="Sponsors"
              icon={
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              active={activeSection === "companies"}
              onClick={() => setActiveSection("companies")}
            />

            <SidebarItem
              label="Expenses"
              icon={
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
              active={activeSection === "expenses"}
              onClick={() => setActiveSection("expenses")}
            />

            <SidebarItem
              label="Create Fest"
              icon={
                <svg
                  aria-hidden="true"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              }
              active={activeSection === "createFest"}
              onClick={() => setActiveSection("createFest")}
            />
          </nav>

          <div className="mt-10 pt-6 border-t border-[var(--border-card)]">
            <p className="text-xs font-medium text-[var(--text-muted)] mb-3">This fest only</p>
            <p className="text-sm text-[var(--text-primary)]">
              {managedFestId != null
                ? <>All sections show data for <strong>{festName || `Fest #${managedFestId}`}</strong> only.</>
                : "No fest assigned. Contact support to be linked to a fest."}
            </p>
          </div>
        </aside>

        <div className="flex-1 flex flex-col">
          <div className="px-8 py-6 border-b border-[var(--border-card)] bg-[var(--surface)]">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {activeSection === "events" && "Manage Events"}
              {activeSection === "approvals" && "Role Approval Requests"}
              {activeSection === "companies" && "Sponsor Agreements"}
              {activeSection === "expenses" && "Expense Tracking"}
              {activeSection === "createFest" && "Create New Fest"}
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {activeSection === "events" && "View and manage all fest events"}
              {activeSection === "approvals" && "Review and approve editor role requests"}
              {activeSection === "companies" && "View sponsor documents and agreements"}
              {activeSection === "expenses" && "Track and review expenses submitted by event hosts"}
              {activeSection === "createFest" && "Create and manage a new fest"}
            </p>
          </div>

          <main className="flex-1 px-8 py-8 overflow-auto">
            {managedFestId == null ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-lg">
                <p className="font-semibold text-amber-800">No fest assigned</p>
                <p className="text-sm text-amber-700 mt-1">
                  Your account is not linked to a fest yet. Contact support to get access to your fest dashboard.
                </p>
              </div>
            ) : (
              <>
                {/* Fest key + financial overview (income/net alongside spend) */}
                <div className="mb-8 space-y-4">
                  <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Fest Key (share with students)</p>
                      <p className="text-2xl font-mono font-bold text-[var(--text-primary)] tracking-wide">
                        {festKey ?? "—"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Students enter this key at signup to join <strong>{festName || "your fest"}</strong>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      disabled={!festKey}
                      className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {keyCopied ? "Copied!" : "Copy key"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
                      <p className="text-sm text-[var(--text-muted)]">Income</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatPaise(analytics?.revenue ?? 0)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">from completed bookings</p>
                    </div>
                    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
                      <p className="text-sm text-[var(--text-muted)]">Spend</p>
                      <p className="text-2xl font-bold text-red-600">
                        {formatPaise(totalSpend ?? 0)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">fest-wide expenses</p>
                    </div>
                    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
                      <p className="text-sm text-[var(--text-muted)]">Net Balance</p>
                      <p className={`text-2xl font-bold ${(netBalance ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {netBalance == null ? "—" : `${netBalance >= 0 ? "+" : ""}${formatPaise(netBalance)}`}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">income − spend</p>
                    </div>
                    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
                      <p className="text-sm text-[var(--text-muted)]">Tickets / Events / Bookings</p>
                      <p className="text-2xl font-bold text-[var(--text-primary)]">
                        {(analytics?.ticketsSold ?? 0).toLocaleString()}
                        <span className="text-[#C5BAC4] text-lg"> · </span>
                        {analytics?.eventsCount ?? 0}
                        <span className="text-[#C5BAC4] text-lg"> · </span>
                        {analytics?.bookingsCount ?? 0}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">sold · events · bookings</p>
                    </div>
                  </div>

                  {/* ANL-01: sales trend chart */}
                  <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sales trend</h2>
                      <span className="text-xs text-[var(--text-muted)]">completed bookings</span>
                    </div>
                    {trend == null ? (
                      <div className="h-40 rounded-lg bg-[var(--surface-slate-100)] animate-pulse" aria-hidden="true" />
                    ) : trend.reduce((a, p) => a + p.revenue, 0) === 0 ? (
                      <div className="h-40 flex items-center justify-center text-sm text-[var(--text-muted)]">
                        No sales yet — your daily revenue will chart here.
                      </div>
                    ) : (
                      <SalesTrendChart points={trend} />
                    )}
                  </div>
                </div>

                {activeSection === "events" && <FestEvents festId={managedFestId} />}
                {activeSection === "approvals" && <RoleRequests />}
                {activeSection === "companies" && <Companies festId={managedFestId} />}
                {activeSection === "expenses" && <Expenses festId={managedFestId} />}
                {activeSection === "createFest" && (<CreateFest />)}
              </>
            )}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function SidebarItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
        ${
          active
            ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white shadow-lg"
            : "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] hover:text-[var(--text-primary)]"
        }`}
    >
      {icon}
      {label}
    </button>
  );
}
