"use client";

import React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

export default function ResetPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params?.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Invalid or missing reset token. Use the link from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("submitting");

    try {
      const res = await fetch(`${getApiUrl()}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Invalid or expired token. Request a new reset link.");
        setStatus("error");
        return;
      }
      setStatus("done");
      setTimeout(() => router.push("/signin?reset=1"), 900);
    } catch {
      setError("Could not reach server. Try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white shadow-md rounded-2xl p-8">
          
          {/* TITLE */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <h1 className="text-2xl font-extrabold text-slate-900">Reset password</h1>

            {/* ✔ NOW ONLY SHOW THIS IF TOKEN EXISTS */}
            {token ? (
              <p className="text-sm text-slate-500 text-center">
                Enter a new password for your account.
              </p>
            ) : null}
          </div>

          {/* SUCCESS MESSAGE */}
          {status === "done" && (
            <div className="mb-4 text-sm text-green-800 bg-green-50 px-4 py-2 rounded-md text-center">
              Password updated — redirecting to sign in…
            </div>
          )}

          {/* ERROR MESSAGE */}
          {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

          {/* NO TOKEN MESSAGE */}
          {!token ? (
            <div className="text-sm text-slate-600">
              No reset token found in the URL. Please open the link from the email we sent you.
            </div>
          ) : (
            /* RESET FORM */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="mt-2 w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-200"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className="mt-2 w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-200"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={status === "submitting" || status === "done"}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition ${
                  status !== "submitting"
                    ? "bg-primary-600 text-white hover:bg-primary-700"
                    : "bg-slate-300 text-slate-600 cursor-not-allowed"
                }`}
              >
                {status === "submitting" ? "Updating…" : "Set new password"}
              </button>
            </form>
          )}

          <div className="text-center text-sm text-slate-500 mt-4">
            Return to{" "}
            <a className="text-primary-600 hover:underline" href="/signin">
              Sign in
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
