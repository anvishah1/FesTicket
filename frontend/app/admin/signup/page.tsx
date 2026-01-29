"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AdminSignUpPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    organization: "",
    designation: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // TODO: Replace with actual API call
    // Simulated API call
    try {
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In real implementation:
      // const response = await fetch('/api/admin/request-access', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData),
      // });

      setSubmitted(true);
    } catch (err) {
      setError("Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#fdfdff] flex flex-col">
        <Header />

        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg border border-[#C5BAC4] p-8 text-center">
              {/* Success Icon */}
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[#29104A] mb-2">Request Submitted!</h2>
              <p className="text-[#6B597F] mb-6">
                Your request for admin access has been sent to the platform owners. You'll receive an email once your request is reviewed.
              </p>

              <div className="bg-[#C5BAC4]/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-[#6B597F]">
                  <span className="font-medium text-[#29104A]">What happens next?</span>
                  <br />
                  Our team will review your request within 24-48 hours. Once approved, you'll receive login credentials via email.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/admin/signin"
                  className="w-full py-3 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white font-semibold rounded-xl hover:opacity-90 transition text-center"
                >
                  Go to Sign In
                </Link>
                <Link
                  href="/"
                  className="w-full py-3 border border-[#C5BAC4] text-[#6B597F] font-medium rounded-xl hover:bg-[#C5BAC4]/20 transition text-center"
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
        <div className="w-full max-w-lg">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-[#C5BAC4] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#29104A] to-[#522C5D] px-8 py-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white">Request Admin Access</h1>
              <p className="text-white/70 text-sm mt-1">Fill in your details to request admin privileges</p>
            </div>

            {/* Info Banner */}
            <div className="mx-8 mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Admin access requires approval</p>
                  <p className="mt-1 text-amber-700">Your request will be reviewed by the platform owners. This is typically for faculty advisors or fest coordinators.</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                  placeholder="you@organization.edu"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1.5">
                    Fest <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.organization}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                    placeholder="Tathva 2025"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#29104A] mb-1.5">
                    Designation/Role <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-4 py-3 border border-[#C5BAC4] rounded-xl bg-[#F9F7FA] text-[#29104A] focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition"
                    placeholder="Faculty Advisor / Fest Coordinator"
                  />
                </div>
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
                    Submitting Request...
                  </span>
                ) : (
                  "Submit Request"
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="px-8 pb-8 pt-2 border-t border-[#C5BAC4]/50">
              <p className="text-center text-sm text-[#6B597F]">
                Already have admin access?{" "}
                <Link href="/admin/signin" className="text-[#522C5D] font-medium hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          </div>

          {/* Back link */}
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
