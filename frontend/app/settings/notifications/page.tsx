"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiFetch, isAuthenticated } from "@/lib/auth";
import { showToast } from "@/lib/toast";

// NOTIF-09: per-category notification preferences. Transactional mail (receipts,
// cancellations) is never listed here — it is always sent.
type Prefs = {
  notifyReminders: boolean;
  notifySalesAlerts: boolean;
  notifySalesDigest: boolean;
  notifyMarketing: boolean;
};

const FIELDS: { key: keyof Prefs; label: string; help: string }[] = [
  { key: "notifyReminders", label: "Event reminders", help: "A nudge 24 hours and 1 hour before events you've booked." },
  { key: "notifySalesAlerts", label: "New-sale alerts", help: "Organizers: email me each time one of my tickets sells." },
  { key: "notifySalesDigest", label: "Daily sales digest", help: "Organizers: a once-a-day summary of sales and inventory." },
  { key: "notifyMarketing", label: "Product & promotional emails", help: "Checkout reminders and occasional product updates." },
];

const DEFAULTS: Prefs = {
  notifyReminders: true,
  notifySalesAlerts: true,
  notifySalesDigest: true,
  notifyMarketing: true,
};

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/signin");
      return;
    }
    (async () => {
      try {
        const res = await apiFetch("/api/notifications/preferences", {}, { redirectOnAuthFailure: false });
        if (res.ok) {
          const body = await res.json();
          if (body?.data) setPrefs({ ...DEFAULTS, ...body.data });
        }
      } catch {
        /* keep defaults */
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) showToast("Notification preferences saved", "success");
      else showToast("Could not save preferences", "error");
    } catch {
      showToast("Could not save preferences", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-10 max-w-2xl">
        <h1 className="text-2xl font-bold">Notification preferences</h1>
        <p className="text-sm text-slate-500 mt-1">
          Choose which emails you&apos;d like to receive. Booking receipts and account emails are always sent.
        </p>

        {!ready ? (
          <div className="mt-6 animate-pulse h-40 bg-gray-200 rounded" />
        ) : (
          <div className="mt-6 rounded-lg bg-white border shadow-sm divide-y">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-start gap-3 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs[f.key]}
                  onChange={() => toggle(f.key)}
                  className="mt-1 h-4 w-4"
                  data-testid={`pref-${f.key}`}
                />
                <span>
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-sm text-slate-500">{f.help}</span>
                </span>
              </label>
            ))}
            <div className="p-4">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save preferences"}
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
