"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiUrl, setAuth } from "@/lib/auth";

// AUTH-06: consumes a magic-link token and signs the user in.
function MagicInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"verifying" | "error">("verifying");
  const ran = useRef(false);

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
          const { accessToken, refreshToken, user } = data.data;
          setAuth(accessToken, refreshToken, user);
          if (user.role === "ADMIN") router.push("/admin/dashboard");
          else if (user.role === "EDITOR" || user.role === "HOST") router.push("/host/dashboard");
          else router.push("/");
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
    })();
  }, [token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)]">
      <div className="max-w-md w-full rounded-xl bg-white border shadow-sm p-8 text-center">
        {state === "verifying" ? (
          <p className="text-slate-500">Signing you in…</p>
        ) : (
          <>
            <h1 className="text-xl font-bold">This link didn&apos;t work</h1>
            <p className="text-slate-600 mt-2">
              It may have expired or already been used. Request a fresh sign-in link from the sign-in page.
            </p>
            <Link
              href="/signin"
              className="inline-block mt-5 px-5 py-2.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold"
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
