"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function HostOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    organizerName: "",
    mobileNumber: "",
    organizationEmail: "",
  });

  const isValid =
    form.organizerName.trim().length > 0 &&
    form.mobileNumber.trim().length >= 10 &&
    form.organizationEmail.trim().includes("@");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    // TODO: Save to backend API
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);

    // Redirect to host dashboard
    router.push("/host/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Complete Your Profile</h1>
              <p className="text-sm text-slate-500 mt-2">
                Tell us about yourself and your organization to get started hosting events.
              </p>
            </div>

            {/* Info Alert */}
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-6">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>These details are mandatory and will be displayed on your event pages.</span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Organizer Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Organizer / Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.organizerName}
                  onChange={(e) => setForm({ ...form, organizerName: e.target.value })}
                  placeholder="e.g., Tathva Organizing Committee"
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">This will appear as the event organizer name</p>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 border border-r-0 border-slate-300 rounded-l-lg bg-slate-50 text-slate-500 text-sm">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={form.mobileNumber}
                    onChange={(e) => setForm({ ...form, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="9876543210"
                    className="flex-1 border border-slate-300 rounded-r-lg px-4 py-3 focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition"
                    required
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">For booking confirmations and support</p>
              </div>

              {/* Organization Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Organization Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.organizationEmail}
                  onChange={(e) => setForm({ ...form, organizationEmail: e.target.value })}
                  placeholder="events@yourorganization.com"
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Displayed on event pages for attendee inquiries</p>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={!isValid || loading}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition ${
                    isValid && !loading
                      ? "bg-primary-600 text-white hover:bg-primary-700"
                      : "bg-slate-300 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue to Dashboard
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            You can update these details later from your dashboard settings.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}

