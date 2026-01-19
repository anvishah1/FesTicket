"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function HostOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    organizerName: "",
    mobileNumber: "",
    organizationEmail: "",
    role: "" as "" | "viewer" | "editor",
  });

  const isValid =
    form.organizerName.trim().length > 0 &&
    form.mobileNumber.trim().length >= 10 &&
    form.organizationEmail.trim().includes("@") &&
    form.role !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    // TODO: Save to backend API
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);

    if (form.role === "editor") {
      // Show pending approval message
      setSubmitted(true);
    } else {
      // Viewer goes directly to dashboard (read-only)
      router.push("/host/dashboard");
    }
  }

  // Show success/pending screen for Editor requests
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fdfdff]">
        <Header />
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-lg">
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-[#29104A] mb-3">Request Submitted!</h1>
              <p className="text-[#6B597F] mb-6">
                Your request to become an <span className="font-semibold text-[#522C5D]">Editor</span> has been sent to the admin for approval.
              </p>
              
              <div className="bg-[#F9F7FA] rounded-xl p-4 mb-6 text-left">
                <p className="text-sm font-medium text-[#29104A] mb-2">What happens next?</p>
                <ul className="text-sm text-[#6B597F] space-y-2">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#522C5D] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    The faculty admin will review your request
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#522C5D] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    You'll receive an email once approved
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#522C5D] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    After approval, you can create and manage events
                  </li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">Estimated time:</span> 1-2 business days
                </p>
              </div>

              <button
                onClick={() => router.push("/")}
                className="w-full px-6 py-3 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] text-white rounded-lg font-semibold hover:opacity-90 transition-all"
              >
                Back to Home
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfdff]">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#522C5D]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-[#29104A]">Complete Your Profile</h1>
              <p className="text-sm text-[#6B597F] mt-2">
                Tell us about yourself and your organization to get started.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-3">
                  Select Your Role <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Viewer Option */}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: "viewer" })}
                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                      form.role === "viewer"
                        ? "border-[#522C5D] bg-[#522C5D]/5"
                        : "border-[#C5BAC4] hover:border-[#6B597F]"
                    }`}
                  >
                    {form.role === "viewer" && (
                      <div className="absolute top-3 right-3">
                        <svg className="w-5 h-5 text-[#522C5D]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-lg bg-[#C5BAC4]/30 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    <p className="font-semibold text-[#29104A]">Viewer</p>
                    <p className="text-xs text-[#6B597F] mt-1">View events & analytics</p>
                  </button>

                  {/* Editor Option */}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: "editor" })}
                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                      form.role === "editor"
                        ? "border-[#522C5D] bg-[#522C5D]/5"
                        : "border-[#C5BAC4] hover:border-[#6B597F]"
                    }`}
                  >
                    {form.role === "editor" && (
                      <div className="absolute top-3 right-3">
                        <svg className="w-5 h-5 text-[#522C5D]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-lg bg-[#522C5D]/10 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <p className="font-semibold text-[#29104A]">Editor</p>
                    <p className="text-xs text-[#6B597F] mt-1">Create & manage events</p>
                  </button>
                </div>

                {/* Role Info Messages */}
                {form.role === "viewer" && (
                  <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-lg text-sm">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>As a Viewer, you can view events and analytics but cannot create or edit them.</span>
                  </div>
                )}
                {form.role === "editor" && (
                  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span><strong>Admin approval required.</strong> Your request will be reviewed by the faculty admin.</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-[#C5BAC4]"></div>

              {/* Organizer Name */}
              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-2">
                  Organizer / Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.organizerName}
                  onChange={(e) => setForm({ ...form, organizerName: e.target.value })}
                  placeholder="e.g., Tathva Organizing Committee"
                  className="w-full border border-[#C5BAC4] rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition bg-[#F9F7FA] outline-none"
                  required
                />
                <p className="text-xs text-[#6B597F] mt-1">This will appear as the event organizer name</p>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-2">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 border border-r-0 border-[#C5BAC4] rounded-l-lg bg-[#C5BAC4]/20 text-[#6B597F] text-sm">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={form.mobileNumber}
                    onChange={(e) => setForm({ ...form, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="9876543210"
                    className="flex-1 border border-[#C5BAC4] rounded-r-lg px-4 py-3 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition bg-[#F9F7FA] outline-none"
                    required
                  />
                </div>
                <p className="text-xs text-[#6B597F] mt-1">For booking confirmations and support</p>
              </div>

              {/* Organization Email */}
              <div>
                <label className="block text-sm font-medium text-[#29104A] mb-2">
                  Organization Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.organizationEmail}
                  onChange={(e) => setForm({ ...form, organizationEmail: e.target.value })}
                  placeholder="events@yourorganization.com"
                  className="w-full border border-[#C5BAC4] rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] transition bg-[#F9F7FA] outline-none"
                  required
                />
                <p className="text-xs text-[#6B597F] mt-1">Displayed on event pages for attendee inquiries</p>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={!isValid || loading}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 font-semibold transition ${
                    isValid && !loading
                      ? "bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] text-white hover:opacity-90"
                      : "bg-[#C5BAC4] text-[#6B597F] cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {form.role === "editor" ? "Submitting Request..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      {form.role === "editor" ? "Submit for Approval" : "Continue to Dashboard"}
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <p className="text-center text-xs text-[#6B597F] mt-6">
            You can update these details later from your dashboard settings.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
