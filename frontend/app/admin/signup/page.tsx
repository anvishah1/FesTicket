"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

export default function AdminSignUpPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    festName: "",
    organization: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name || undefined,
          festName: formData.festName || undefined,
          organization: formData.organization || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || data.message || "Request failed.";
        setError(msg);
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not reach server. Try again.");
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#fdfdff] flex flex-col">
        <Header />

        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg border border-[#C5BAC4] p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[#29104A] mb-2">Request submitted</h2>
              <p className="text-[#6B597F] mb-6">
                Your request for admin access has been received. We&apos;ll verify and set you up with login credentials and a fest key. You can then sign in at Admin Sign In.
              </p>

              <div className="flex flex-col gap-3">
                <Link
                  href="/"
                  className="w-full py-3 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white font-semibold rounded-xl hover:opacity-90 transition text-center"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfdff] flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-[#C5BAC4] overflow-hidden">
            <div className="bg-gradient-to-r from-[#29104A] to-[#522C5D] px-8 py-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white">Request admin access</h1>
              <p className="text-white/70 text-sm mt-1">We&apos;ll verify and send you credentials and a fest key</p>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-1.5">Name (optional)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-1.5">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                  placeholder="you@college.edu"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-1.5">Fest name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.festName}
                  onChange={(e) => setFormData({ ...formData, festName: e.target.value })}
                  className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                  placeholder="e.g. ComicCon, Ragam, Tathva"
                />
                <p className="text-xs text-[#6B597F] mt-1">This name will appear on your admin dashboard</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-1.5">College / Organization (optional)</label>
                <input
                  type="text"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                  placeholder="e.g. NIT Calicut, NITC"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    Creating account...
                  </span>
                ) : (
                  "Submit request"
                )}
              </button>
            </form>

            <div className="px-8 pb-8 pt-2 border-t border-[#C5BAC4]/50">
              <p className="text-center text-sm text-[#6B597F]">
                Already have an account?{" "}
                <Link href="/admin/signin" className="text-[#522C5D] font-medium hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-[#6B597F] hover:text-[#29104A] transition">
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
