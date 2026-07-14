"use client";

import { useState, useEffect } from "react";
import { getApiUrl, getAccessToken, apiFetch } from "@/lib/auth";

interface RoleRequest {
  id: number;
  userId: number;
  festId?: number | null;
  festName?: string | null;
  studentName: string;
  email: string;
  organization: string | null;
  requestedRole: string;
  requestDate: string;
  status?: string;
}

type Tab = "pending" | "approved";

export default function RoleRequests() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("pending");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // `?status=all` — the API returns ONLY pending by default, so the Approved tab
    // would otherwise always be empty. We split the two client-side below.
    apiFetch(`${getApiUrl()}/api/role-requests?status=all`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load requests");
        return res.json();
      })
      .then((data) => {
        // Unified envelope: the request array is under `data`.
        const list: RoleRequest[] = Array.isArray(data?.data) ? data.data : [];
        // Newest requests on top, oldest pushed down. Sort by requestDate desc
        // with the (monotonic) id as a tiebreaker so requests created in the same
        // moment still order deterministically newest-first.
        list.sort((a, b) => {
          const diff =
            new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
          return diff !== 0 ? diff : b.id - a.id;
        });
        setRequests(list);
      })
      .catch(() => setError("Could not load role requests."))
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id: number) => {
    const token = getAccessToken();
    if (!token) return;
    setActionLoading(id);
    try {
      const res = await apiFetch(`${getApiUrl()}/api/role-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (!res.ok) throw new Error("Approve failed");
      setRequests((prev) =>
        prev.map((req) =>
          req.id === id
            ? { ...req, status: "APPROVED" }
            : req
        )
      );
    } catch {
      setError("Failed to approve.");
    }
    setActionLoading(null);
  };

  const handleDeny = async (id: number) => {
    const token = getAccessToken();
    if (!token) return;
    setActionLoading(id);
    try {
      const res = await apiFetch(`${getApiUrl()}/api/role-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "DENIED" }),
      });
      if (!res.ok) throw new Error("Deny failed");
      setRequests((prev) => prev.filter((req) => req.id !== id));
    } catch {
      setError("Failed to deny.");
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-12 text-center shadow-sm">
        <p className="text-[var(--text-muted)]">Loading role requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-12 text-center shadow-sm">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // Pending vs Approved live in separate tabs. handleApprove flips the row's status
  // in state, so an approved request LEAVES pending and appears under Approved with
  // no refetch. (DENIED requests are dropped by handleDeny and have no tab.)
  const statusOf = (req: RoleRequest) => (req.status || "PENDING").toUpperCase();
  const pending = requests.filter((req) => statusOf(req) === "PENDING");
  const approved = requests.filter((req) => statusOf(req) === "APPROVED");
  const active = tab === "pending" ? pending : approved;

  // Search runs against the ACTIVE tab only, so each section is searched on its own.
  // Matches the three fields an admin recognises a request by — name, email and fest
  // — plus the free-text organization, which is what the row renders when festName
  // is absent.
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? active.filter((req) =>
        [req.studentName, req.email, req.festName, req.organization].some((field) =>
          (field || "").toLowerCase().includes(needle)
        )
      )
    : active;

  return (
    <div className="space-y-4">
      {requests.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg aria-hidden="true" className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-medium text-[var(--text-primary)]">All caught up!</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">No pending approval requests</p>
        </div>
      ) : (
        <>
          {/* Pending / Approved switcher. Counts come from the split lists, so an
              approval visibly moves the row from one tab to the other. */}
          <div
            role="tablist"
            aria-label="Role request status"
            className="inline-flex rounded-lg border border-[var(--border-card)] bg-[var(--surface)] p-1"
          >
            {(
              [
                { key: "pending", label: "Pending", count: pending.length },
                { key: "approved", label: "Approved", count: approved.length },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  tab === t.key
                    ? "bg-[var(--fill-plum)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-slate-100)]"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          {/* Search over the already-loaded list, so filtering is instant and
              costs no extra request. Scoped to the ACTIVE tab. */}
          <div className="relative">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search role requests by name, email or fest"
              placeholder="Search by name, email or fest…"
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--surface)] pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-plum)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]"
            />
          </div>

          {active.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-12 text-center shadow-sm">
              <p className="text-lg font-medium text-[var(--text-primary)]">
                {tab === "pending" ? "No pending requests" : "No approved requests yet"}
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {tab === "pending"
                  ? "You're all caught up."
                  : "Requests you approve will appear here."}
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-12 text-center shadow-sm">
              <p className="text-lg font-medium text-[var(--text-primary)]">No matching requests</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Nothing in {tab === "pending" ? "Pending" : "Approved"} matches “{query.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 px-4 py-2 rounded-lg border border-[var(--border-plum)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--surface-slate-100)] transition"
              >
                Clear search
              </button>
            </div>
          ) : (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-[var(--border-card)] bg-[color-mix(in_srgb,var(--surface-card)_10%,transparent)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {needle
                ? `${visible.length} of ${active.length} request${active.length === 1 ? "" : "s"}`
                : `${active.length} ${tab === "pending" ? "Pending" : "Approved"} Request${active.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="divide-y divide-[var(--border-card)]">
            {visible.map((req) => (
              <div
                key={req.id}
                /* Stacks on mobile: side-by-side, the Approve/Deny buttons were
                   clipped by the card's overflow-hidden and unreachable at 375px. */
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 sm:px-6 py-5 hover:bg-[color-mix(in_srgb,var(--surface-card)_5%,transparent)] transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center text-white font-bold">
                    {(req.studentName || req.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">
                      {req.studentName}
                    </p>
                    <p className="text-sm text-[var(--text-muted)] truncate">
                      {req.email}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] text-[var(--text-secondary)] rounded text-xs font-medium">
                        {req.requestedRole}
                      </span>
                      <span className="text-xs text-[#C5BAC4]">•</span>
                      <span className="text-xs text-[var(--text-muted)]">{req.festName || req.organization || "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                  <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {new Date(req.requestDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {req.status === "PENDING" || !req.status ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={actionLoading === req.id}
                        className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                      >
                        {actionLoading === req.id ? (
                          <svg aria-hidden="true" className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            ></path>
                          </svg>
                        ) : (
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        Approve
                      </button>

                      <button
                        onClick={() => handleDeny(req.id)}
                        disabled={actionLoading === req.id}
                        className="px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  ) : (
                    <p
                      className={`text-sm font-semibold ${
                        req.status === "APPROVED"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {req.status}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
          )}
        </>
      )}
    </div>
  );
}
