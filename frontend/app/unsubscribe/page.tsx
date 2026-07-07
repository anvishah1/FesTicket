"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getApiUrl } from "@/lib/auth";

// NOTIF-09: public unsubscribe landing (no login). Reads the signed token from
// the URL and confirms the opt-out via the one-click endpoint.
function UnsubscribeInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = React.useState<"loading" | "done" | "error">("loading");

  React.useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`, {
          method: "POST",
        });
        setState(res.ok ? "done" : "error");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  return (
    <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl bg-white border shadow-sm p-8 text-center">
        {state === "loading" && <p className="text-slate-500">Updating your preferences…</p>}
        {state === "done" && (
          <>
            <h1 className="text-xl font-bold">You&apos;re unsubscribed</h1>
            <p className="text-slate-500 mt-2">
              You&apos;ll no longer receive these emails. You can re-enable them any time from your notification settings.
            </p>
            <Link
              href="/settings/notifications"
              className="inline-block mt-5 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold"
            >
              Manage preferences
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-xl font-bold">Link invalid</h1>
            <p className="text-slate-500 mt-2">
              This unsubscribe link is invalid or has already been used. You can manage all your email preferences from
              your account.
            </p>
            <Link
              href="/settings/notifications"
              className="inline-block mt-5 px-4 py-2 rounded-md border font-semibold hover:bg-slate-50"
            >
              Manage preferences
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <UnsubscribeInner />
    </Suspense>
  );
}
