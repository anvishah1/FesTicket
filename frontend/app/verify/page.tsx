"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

type Status = "verifying" | "success" | "error" | "no-token";

// AUTH-01: reads ?token, verifies it via the API, and offers a resend-verification
// path on an invalid/expired/missing token.
export default function VerifyPage() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const [status, setStatus] = React.useState<Status>(token ? "verifying" : "no-token");
  const [message, setMessage] = React.useState<string>("");
  const [resendEmail, setResendEmail] = React.useState("");
  const [resendState, setResendState] = React.useState<"idle" | "sending" | "sent">("idle");

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.success !== false) {
          setStatus("success");
        } else {
          setStatus("error");
          setMessage(data.error?.message || "This verification link is invalid or has expired.");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not verify right now. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim() || resendState === "sending") return;
    setResendState("sending");
    try {
      await fetch(`${getApiUrl()}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
    } catch {
      /* enumeration-safe: the outcome is the same regardless */
    }
    setResendState("sent");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-16">
        <div className="max-w-md mx-auto rounded-lg bg-[var(--surface)] border p-8 shadow-sm text-center">
          {status === "verifying" && (
            <>
              <h1 className="text-xl font-bold">Verifying your email…</h1>
              <p className="text-sm text-[var(--text-soft)] mt-2">One moment.</p>
            </>
          )}

          {status === "success" && (
            <>
              <h1 className="text-xl font-bold text-green-700">Email verified ✓</h1>
              <p className="text-sm text-[var(--text-soft)] mt-2">Your account is ready. You can sign in now.</p>
              <Link
                href="/signin"
                className="inline-block mt-5 px-4 py-2 bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white rounded-md font-semibold"
              >
                Go to sign in
              </Link>
            </>
          )}

          {(status === "error" || status === "no-token") && (
            <>
              <h1 className="text-xl font-bold text-[var(--text-slate-800)]">
                {status === "no-token" ? "Verify your email" : "Verification failed"}
              </h1>
              <p className="text-sm text-[var(--text-soft)] mt-2">
                {status === "no-token"
                  ? "Enter your email to receive a new verification link."
                  : message}
              </p>
              {resendState === "sent" ? (
                <p className="text-sm text-green-700 mt-5">
                  If your account needs verification, a new link is on its way. Check your inbox.
                </p>
              ) : (
                <form onSubmit={resend} className="mt-5 flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email"
                    className="flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-[var(--ring-plum)]"
                  />
                  <button
                    type="submit"
                    disabled={!resendEmail.trim() || resendState === "sending"}
                    className="px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] disabled:opacity-50 text-white font-semibold"
                  >
                    {resendState === "sending" ? "Sending…" : "Resend link"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
