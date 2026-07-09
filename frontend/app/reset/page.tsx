"use client";

import React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PasswordFields from "@/components/PasswordFields";
import { getPasswordChecks } from "@/lib/password";
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
    // AUTH-07: enforce the full policy up-front (byte-aligned with the backend),
    // so a password the server would 400 can't even be submitted.
    if (!getPasswordChecks(password, confirm).valid) {
      setError("Please satisfy all the password rules below.");
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
        setError(data.error?.message || "Invalid or expired token. Request a new reset link.");
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
        <div className="w-full max-w-md bg-[var(--surface)] shadow-md rounded-2xl p-8">
          
          {/* TITLE */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <h1 className="text-2xl font-extrabold text-[var(--text-slate-900)]">Reset password</h1>

            {/* ✔ NOW ONLY SHOW THIS IF TOKEN EXISTS */}
            {token ? (
              <p className="text-sm text-[var(--text-soft)] text-center">
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
            <div className="text-sm text-[var(--text-slate)]">
              No reset token found in the URL. Please open the link from the email we sent you.
            </div>
          ) : (
            /* RESET FORM */
            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordFields
                password={password}
                confirm={confirm}
                onPasswordChange={setPassword}
                onConfirmChange={setConfirm}
                idPrefix="reset"
              />

              <button
                type="submit"
                disabled={
                  status === "submitting" ||
                  status === "done" ||
                  !getPasswordChecks(password, confirm).valid
                }
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition ${
                  status !== "submitting" && getPasswordChecks(password, confirm).valid
                    ? "bg-[var(--fill-ink)] text-white hover:bg-[var(--fill-ink)]"
                    : "bg-[var(--surface-slate-200)] text-[var(--text-slate)] cursor-not-allowed"
                }`}
              >
                {status === "submitting" ? "Updating…" : "Set new password"}
              </button>
            </form>
          )}

          <div className="text-center text-sm text-[var(--text-soft)] mt-4">
            Return to{" "}
            <a className="text-[var(--text-primary)] hover:underline" href="/signin">
              Sign in
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
