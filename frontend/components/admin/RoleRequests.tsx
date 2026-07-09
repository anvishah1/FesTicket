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

export default function RoleRequests() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch(`${getApiUrl()}/api/role-requests`)
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
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-[var(--border-card)] bg-[color-mix(in_srgb,var(--surface-card)_10%,transparent)]">
            <p className="font-semibold text-[var(--text-primary)]">{requests.length} Pending Request{requests.length > 1 ? 's' : ''}</p>
          </div>
          
          <div className="divide-y divide-[#C5BAC4]">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between px-6 py-5 hover:bg-[color-mix(in_srgb,var(--surface-card)_5%,transparent)] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center text-white font-bold">
                    {(req.studentName || req.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {req.studentName}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {req.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] text-[var(--text-secondary)] rounded text-xs font-medium">
                        {req.requestedRole}
                      </span>
                      <span className="text-xs text-[#C5BAC4]">•</span>
                      <span className="text-xs text-[var(--text-muted)]">{req.festName || req.organization || "—"}</span>
                    </div>
                    <div className="mt-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          req.status === "APPROVED"
                            ? "bg-green-100 text-green-700"
                            : req.status === "DENIED"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {req.status || "PENDING"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-[var(--text-muted)]">
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
    </div>
  );
}
