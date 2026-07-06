"use client";

import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("sending");

    try {
      await fetch(`${getApiUrl()}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Backend always returns a generic 200 to avoid email enumeration,
      // so show the success state regardless of whether the email exists.
      setStatus("sent");
    } catch {
      setError("Could not reach server. Try again.");
      setStatus("idle");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/* HEADER */}
      <Header />

      {/* MAIN SECTION */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white shadow-md rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Forgot password</h1>
          <p className="text-sm text-slate-600 text-center mb-6">
            Enter your account email and we’ll send a link to reset your password.
          </p>

          {status === "sent" && (
            <div className="mb-4 text-sm text-green-700 bg-green-100 px-4 py-2 rounded-lg text-center">
              If an account exists for that email, a password reset link has been sent.
            </div>
          )}

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                className="mt-2 w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-200"
                placeholder="you@school.edu"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg py-3 transition"
            >
              {status === "sending" ? "Sending…" : "Send reset email"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            Remembered password?{" "}
            <a href="/signin" className="text-primary-600 hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </main>

      {/* FOOTER */}
      <Footer />
    </div>
  );
}
