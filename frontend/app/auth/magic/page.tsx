"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiUrl, setAuth } from "@/lib/auth";

// AUTH-06: consumes a magic-link token and signs the user in.
function MagicInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"verifying" | "error" | "twofactor">("verifying");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);

  const finishSession = (data: {
    data: {
      accessToken: string;
      refreshToken: string;
      user: { id: number; email: string; name?: string | null; role: string; profileCompleted: boolean };
    };
  }) => {
    const { accessToken, refreshToken, user } = data.data;
    setAuth(accessToken, refreshToken, user);
    if (user.role === "ADMIN") router.push("/admin/dashboard");
    else if (user.role === "EDITOR" || user.role === "HOST") router.push("/host/dashboard");
    else router.push("/");
  };

  useEffect(() => {
    if (ran.current) return; // single-use token — never POST twice
    ran.current = true;
    if (!token) {
      setState("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/auth/magic-link/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // AUTH-08: 2FA-enabled accounts must complete the second factor.
          if (data.data?.twoFactorRequired) {
            setChallengeToken(data.data.challengeToken);
            setState("twofactor");
          } else {
            finishSession(data);
          }
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
    })();
  }, [token, router]);

  const verify2FA = async (e: FormEvent) => {
    e.preventDefault();
    if (!challengeToken || busy) return;
    setBusy(true);
    try {
      const body = useBackup ? { challengeToken, backupCode: code.trim() } : { challengeToken, code: code.trim() };
      const res = await fetch(`${getApiUrl()}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) finishSession(data);
      else {
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)]">
      <div className="max-w-md w-full rounded-xl bg-[var(--surface)] border shadow-sm p-8 text-center">
        {state === "verifying" ? (
          <p className="text-[var(--text-soft)]">Signing you in…</p>
        ) : state === "twofactor" ? (
          <form onSubmit={verify2FA} className="space-y-3 text-left" data-testid="magic-2fa">
            <h1 className="text-xl font-bold text-center">Two-factor authentication</h1>
            <p className="text-sm text-[var(--text-soft)] text-center">
              {useBackup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}
            </p>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode={useBackup ? "text" : "numeric"}
              placeholder={useBackup ? "XXXX-XXXX-XXXX-XXXX" : "123456"}
              aria-label="Authentication code"
              className="w-full border rounded-md px-3 py-2 tracking-widest text-center"
            />
            <button
              type="submit"
              disabled={!code.trim() || busy}
              className="w-full px-4 py-2.5 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUseBackup((b) => !b);
                setCode("");
              }}
              className="w-full text-sm text-[var(--text-primary)] hover:underline"
            >
              {useBackup ? "Use your authenticator app instead" : "Use a backup code instead"}
            </button>
          </form>
        ) : (
          <>
            <h1 className="text-xl font-bold">This link didn&apos;t work</h1>
            <p className="text-[var(--text-slate)] mt-2">
              It may have expired or already been used. Request a fresh sign-in link from the sign-in page.
            </p>
            <Link
              href="/signin"
              className="inline-block mt-5 px-5 py-2.5 rounded-md bg-[var(--fill-ink)] hover:bg-[var(--fill-ink)] text-white font-semibold"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <MagicInner />
    </Suspense>
  );
}
