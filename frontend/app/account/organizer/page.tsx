"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiFetch, isAuthenticated } from "@/lib/auth";
import { showToast } from "@/lib/toast";

interface RoleRequest {
  id: number;
  festId?: number | null;
  festName?: string | null;
  requestedRole?: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  requestDate?: string;
}

const badge: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  DENIED: "bg-red-100 text-red-700",
};

// AUTH-03: let a signed-in VIEWER request organizer (EDITOR) access with a fest
// key and track the request status. Consumes the existing role-request endpoints.
export default function OrganizerUpgradePage() {
  const router = useRouter();
  const [requests, setRequests] = React.useState<RoleRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [festKey, setFestKey] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/role-requests/mine");
      const data = await res.json();
      if (res.ok && data.success) setRequests(data.data || []);
    } catch {
      /* non-fatal — the form still works */
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/signin");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPending = requests.some((r) => r.status === "PENDING");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    if (!festKey.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/role-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ festKey: festKey.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Request submitted — pending approval.", "success");
        setFestKey("");
        await load();
      } else if (res.status === 409) {
        showToast(data.error?.message || "You already have a pending request.", "error");
        await load();
      } else {
        setFieldError(data.error?.details?.festKey || data.error?.message || "Could not submit the request.");
      }
    } catch {
      setFieldError("Could not reach the server. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-10">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-extrabold">Become an organizer</h1>
            <Link href="/account" className="text-sm text-[var(--text-primary)] hover:underline">
              ← Account
            </Link>
          </div>
          <p className="text-sm text-[var(--text-soft)]">
            Enter the fest key your fest&apos;s admin gave you to request organizer (editor) access.
          </p>

          <section className="rounded-lg bg-[var(--surface)] border p-6 shadow-sm">
            <form onSubmit={submit} className="space-y-3">
              <label htmlFor="fest-key" className="block text-sm font-medium text-[var(--text-strong)]">
                Fest key
              </label>
              <input
                id="fest-key"
                value={festKey}
                onChange={(e) => setFestKey(e.target.value)}
                placeholder="e.g. TECHFEST-2026"
                disabled={hasPending}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-[var(--ring-plum)] disabled:bg-[var(--surface-slate)]"
              />
              {fieldError && <p className="text-sm text-red-600">{fieldError}</p>}
              {hasPending ? (
                <p className="text-sm text-amber-700">
                  You already have a pending request. You&apos;ll be upgraded once an admin approves it.
                </p>
              ) : (
                <button
                  type="submit"
                  disabled={!festKey.trim() || submitting}
                  className="px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] disabled:opacity-50 text-white font-semibold"
                >
                  {submitting ? "Submitting…" : "Request access"}
                </button>
              )}
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Your requests</h2>
            {loading ? (
              <div className="h-16 bg-[var(--surface-slate-200)] rounded animate-pulse" />
            ) : requests.length === 0 ? (
              <p className="text-sm text-[var(--text-soft)]">No requests yet.</p>
            ) : (
              <ul className="space-y-3" data-testid="request-list">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-lg bg-[var(--surface)] border p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-[var(--text-slate-800)]">{r.festName || "Fest"}</p>
                        <p className="text-xs text-[var(--text-soft)]">
                          {r.requestedRole || "EDITOR"} ·{" "}
                          {r.requestDate ? new Date(r.requestDate).toLocaleDateString("en-IN") : ""}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge[r.status] || "bg-[var(--surface-slate-100)] text-[var(--text-slate)]"}`}>
                        {r.status}
                      </span>
                    </div>
                    {r.status === "APPROVED" && (
                      <p className="mt-2 text-sm text-green-700">
                        Approved! Sign out and sign back in to activate your organizer access.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
