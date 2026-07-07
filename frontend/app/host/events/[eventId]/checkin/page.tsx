"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiFetch, getStoredUser, isAuthenticated } from "@/lib/auth";

type CheckinResult =
  | { status: "ADMITTED" | "ALREADY" | "INVALID"; name?: string; ticketType?: string; checkedInAt?: string; reason?: string }
  | null;

interface Html5QrcodeInstance {
  start: (
    camera: { facingMode: string },
    config: { fps: number; qrbox: number },
    onDecode: (text: string) => void,
    onError: () => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear?: () => void;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-8">
        <div className="max-w-lg mx-auto space-y-5">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

// TIX-03: fest-scoped door scanner. Camera scan via a dynamically-imported
// html5-qrcode (client-only, avoids SSR/Turbopack breakage), with a manual-entry
// fallback for damaged QRs. Both feed the same checkIn() -> POST /checkin.
export default function CheckinPage() {
  const params = useParams();
  const eventId = Number(params?.eventId);
  const [ready, setReady] = React.useState(false);
  const [accessDenied, setAccessDenied] = React.useState(false);
  const [eventName, setEventName] = React.useState("");
  const [manualCode, setManualCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<CheckinResult>(null);
  const [scanning, setScanning] = React.useState(false);
  const scannerRef = React.useRef<Html5QrcodeInstance | null>(null);

  React.useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = "/signin";
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/api/events/${eventId}`);
        const data = await res.json();
        if (!res.ok || !data.success || !data.data) {
          setAccessDenied(true);
          setReady(true);
          return;
        }
        const ev = data.data;
        const user = getStoredUser();
        const scopedFestId = user?.role === "ADMIN" ? user?.managedFestId : user?.editorFestId;
        const canManage =
          (user?.id != null && ev.hostId === user.id) ||
          (ev.festId != null && scopedFestId != null && scopedFestId === ev.festId);
        if (!canManage) {
          setAccessDenied(true);
        } else {
          setEventName(ev.name || "");
        }
      } catch {
        setAccessDenied(true);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkIn = React.useCallback(
    async (code: string) => {
      const c = code.trim();
      if (!c || busy) return;
      setBusy(true);
      try {
        const res = await apiFetch("/api/bookings/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: c }),
        });
        const data = await res.json();
        const d = data.data || {};
        setResult({
          status: d.status || "INVALID",
          name: d.attendee?.name,
          ticketType: d.attendee?.ticketType,
          checkedInAt: d.checkedInAt,
          reason: d.reason || data.error?.message,
        });
      } catch {
        setResult({ status: "INVALID", reason: "Network error — try again." });
      }
      setBusy(false);
    },
    [busy]
  );

  const stopCamera = React.useCallback(async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear?.();
    } catch {
      /* already stopped */
    }
    scannerRef.current = null;
    setScanning(false);
  }, []);

  async function startCamera() {
    if (scanning) return;
    try {
      const mod = await import("html5-qrcode");
      const scanner = new mod.Html5Qrcode("qr-reader") as unknown as Html5QrcodeInstance;
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decoded: string) => checkIn(decoded),
        () => {}
      );
    } catch {
      setScanning(false);
    }
  }

  React.useEffect(() => () => void stopCamera(), [stopCamera]);

  if (!ready) return <Shell><p className="text-center text-slate-500 py-16">Loading…</p></Shell>;
  if (accessDenied)
    return <Shell><p className="text-center text-slate-500 py-16">You do not have access to check-in for this event.</p></Shell>;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Check-in{eventName ? ` · ${eventName}` : ""}</h1>
        <Link href={`/host/events/${eventId}/manage`} className="text-sm text-primary-600 hover:underline">
          ← Manage
        </Link>
      </div>

      {result && (
        <div
          data-testid="checkin-result"
          className={`rounded-lg p-6 text-center text-white font-bold text-xl ${
            result.status === "ADMITTED" ? "bg-green-600" : result.status === "ALREADY" ? "bg-amber-500" : "bg-red-600"
          }`}
        >
          <div>
            {result.status === "ADMITTED" ? "✓ ADMITTED" : result.status === "ALREADY" ? "ALREADY CHECKED IN" : "INVALID"}
          </div>
          {result.name && (
            <div className="text-base font-medium mt-1">
              {result.name}
              {result.ticketType ? ` · ${result.ticketType}` : ""}
            </div>
          )}
          {result.status === "ALREADY" && result.checkedInAt && (
            <div className="text-sm font-normal mt-1">First admitted {new Date(result.checkedInAt).toLocaleString()}</div>
          )}
          {result.status === "INVALID" && result.reason && <div className="text-sm font-normal mt-1">{result.reason}</div>}
        </div>
      )}

      <div className="rounded-lg bg-white border p-4 shadow-sm">
        <div id="qr-reader" className="w-full max-w-sm mx-auto" />
        {!scanning ? (
          <button type="button" onClick={startCamera} className="mt-3 w-full px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold">
            Start camera
          </button>
        ) : (
          <button type="button" onClick={stopCamera} className="mt-3 w-full px-4 py-2 rounded-md border font-semibold">
            Stop camera
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          checkIn(manualCode);
          setManualCode("");
        }}
        className="rounded-lg bg-white border p-4 shadow-sm flex flex-col sm:flex-row gap-3"
      >
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Enter ticket code"
          aria-label="Ticket code"
          className="flex-1 px-3 py-2 border rounded-md"
        />
        <button type="submit" disabled={busy || !manualCode.trim()} className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold">
          {busy ? "Checking…" : "Admit"}
        </button>
      </form>
    </Shell>
  );
}
