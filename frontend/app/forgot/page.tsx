"use client";

import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    // mock request — replace with your backend call
    await new Promise((res) => setTimeout(res, 800));

    setStatus("sent");
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
              Reset email sent! Check your inbox.
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
