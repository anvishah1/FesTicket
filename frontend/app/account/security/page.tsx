"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiFetch, isAuthenticated } from "@/lib/auth";
import { showToast } from "@/lib/toast";

// AUTH-08: enable / disable TOTP two-factor.
type Phase = "loading" | "off" | "enrolling" | "backup" | "on";

export default function SecurityPage() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [qr, setQr] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [disableInput, setDisableInput] = React.useState("");

  React.useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/signin");
      return;
    }
    (async () => {
      try {
        const res = await apiFetch("/api/user/me", {}, { redirectOnAuthFailure: false });
        const body = await res.json();
        setPhase(body?.data?.twoFactorEnabled ? "on" : "off");
      } catch {
        setPhase("off");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/2fa/setup", { method: "POST" });
      const body = await res.json();
      if (res.ok && body.success) {
        setQr(body.data.qrDataUrl);
        setSecret(body.data.secret);
        setPhase("enrolling");
      } else {
        showToast("Could not start 2FA setup", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setBackupCodes(body.data.backupCodes || []);
        setCode("");
        setPhase("backup");
        showToast("Two-factor authentication enabled", "success");
      } else {
        showToast(body.error?.message || "Invalid code", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      // Accept either a TOTP code (6 digits) or the account password.
      const val = disableInput.trim();
      const payload = /^\d{6}$/.test(val) ? { code: val } : { password: val };
      const res = await apiFetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        setDisableInput("");
        setPhase("off");
        showToast("Two-factor authentication disabled", "success");
      } else {
        showToast(body.error?.message || "Could not disable 2FA", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-10 max-w-lg">
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-sm text-[var(--text-soft)] mt-1">Protect your account with two-factor authentication.</p>

        <div className="mt-6 rounded-lg bg-[var(--surface)] border shadow-sm p-6">
          {phase === "loading" && <div className="animate-pulse h-24 bg-[var(--surface-slate-200)] rounded" />}

          {phase === "off" && (
            <>
              <h2 className="font-semibold">Two-factor authentication is off</h2>
              <p className="text-sm text-[var(--text-soft)] mt-1">
                Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password…).
              </p>
              <button
                type="button"
                onClick={startEnroll}
                disabled={busy}
                className="mt-4 px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold disabled:opacity-50"
                data-testid="enable-2fa"
              >
                {busy ? "Starting…" : "Enable two-factor"}
              </button>
            </>
          )}

          {phase === "enrolling" && (
            <>
              <h2 className="font-semibold">Scan this QR code</h2>
              <p className="text-sm text-[var(--text-soft)] mt-1">Scan it in your authenticator app, then enter the 6-digit code.</p>
              {qr && (
                <Image src={qr} alt="2FA QR code" width={200} height={200} className="my-4 border rounded" unoptimized />
              )}
              {secret && <p className="text-xs text-[var(--text-faint)] break-all">Or enter this key manually: {secret}</p>}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
                aria-label="Authenticator code"
                className="mt-3 w-full border rounded-md px-3 py-2 tracking-widest text-center"
                data-testid="enroll-code"
              />
              <button
                type="button"
                onClick={confirmEnable}
                disabled={busy || !code.trim()}
                className="mt-3 px-4 py-2 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold disabled:opacity-50"
                data-testid="confirm-2fa"
              >
                {busy ? "Verifying…" : "Verify & enable"}
              </button>
            </>
          )}

          {phase === "backup" && (
            <>
              <h2 className="font-semibold">Save your backup codes</h2>
              <p className="text-sm text-[var(--text-soft)] mt-1">
                Each code works once if you lose your device. Store them somewhere safe — they won&apos;t be shown again.
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm" data-testid="backup-codes">
                {backupCodes.map((c) => (
                  <li key={c} className="bg-[var(--surface-slate)] border rounded px-2 py-1 text-center">{c}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setPhase("on")}
                className="mt-4 px-4 py-2 rounded-md border font-semibold hover:bg-[var(--surface-slate)]"
              >
                I&apos;ve saved them
              </button>
            </>
          )}

          {phase === "on" && (
            <>
              <h2 className="font-semibold text-green-700">Two-factor authentication is on</h2>
              <p className="text-sm text-[var(--text-soft)] mt-1">Enter a current code or your password to turn it off.</p>
              <input
                value={disableInput}
                onChange={(e) => setDisableInput(e.target.value)}
                placeholder="123456 or your password"
                aria-label="Disable input"
                className="mt-3 w-full border rounded-md px-3 py-2"
                data-testid="disable-input"
              />
              <button
                type="button"
                onClick={disable}
                disabled={busy || !disableInput.trim()}
                className="mt-3 px-4 py-2 rounded-md border border-red-300 text-red-700 font-semibold hover:bg-red-50 disabled:opacity-50"
                data-testid="disable-2fa"
              >
                {busy ? "Disabling…" : "Disable two-factor"}
              </button>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
