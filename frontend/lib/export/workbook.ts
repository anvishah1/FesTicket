// frontend/lib/export/workbook.ts
// ANL-05: build a multi-sheet analytics workbook (Summary, Events, Ticket-types,
// Sponsors) for a fest. xlsx is loaded ONLY via a dynamic import() inside the
// handler — a top-level `import * as XLSX from "xlsx"` crashes the Turbopack
// compile worker (see host manage page). If the dynamic import fails at runtime,
// we fall back to downloading one CSV per sheet so the user still gets the data.
import { getApiUrl, apiFetch } from "@/lib/auth";
import { showToast } from "@/lib/toast";

// Money columns are exported as plain RUPEE NUMBERS (paise/100), never "₹…"
// strings, so Excel can sum them.
const rupees = (paise: number) => Math.round((paise || 0)) / 100;
const pct = (frac: number) => Math.round((frac || 0) * 100);

type Cell = string | number;
interface Sheet {
  name: string;
  rows: Cell[][]; // first row is the header
}

async function fetchData(url: string): Promise<unknown> {
  try {
    const r = await apiFetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.success ? j.data : null;
  } catch {
    return null;
  }
}

function buildSheets(
  summary: Record<string, number> | null,
  events: Record<string, number | string>[] | null,
  ticketTypes: Record<string, number | string>[] | null,
  sponsors: Record<string, number | string>[] | null
): Sheet[] {
  const evs = Array.isArray(events) ? events : [];
  const tts = Array.isArray(ticketTypes) ? ticketTypes : [];
  const sps = Array.isArray(sponsors) ? sponsors : [];

  const summarySheet: Sheet = {
    name: "Summary",
    rows: [
      ["Metric", "Value"],
      ["Income (₹)", rupees(Number(summary?.revenue) || 0)],
      ["Tickets sold", Number(summary?.ticketsSold) || 0],
      ["Events", Number(summary?.eventsCount) || 0],
      ["Bookings", Number(summary?.bookingsCount) || 0],
    ],
  };

  const eventsSheet: Sheet = {
    name: "Events",
    rows: [
      ["Event", "Revenue (₹)", "Tickets sold", "Capacity", "Sell-through (%)", "Bookings", "Conversion (%)"],
      ...evs.map((e) => [
        String(e.name ?? ""),
        rupees(Number(e.revenue) || 0),
        Number(e.ticketsSold) || 0,
        Number(e.capacity) || 0,
        pct(Number(e.sellThrough) || 0),
        Number(e.bookings) || 0,
        pct(Number(e.conversion) || 0),
      ]),
    ],
  };

  const ticketSheet: Sheet = {
    name: "Ticket-types",
    rows: [
      ["Event", "Ticket type", "Price (₹)", "Quantity", "Sold", "Available", "Sell-through (%)", "Revenue (₹)"],
      ...tts.map((t) => [
        String(t.eventName ?? ""),
        String(t.name ?? ""),
        rupees(Number(t.price) || 0),
        Number(t.quantity) || 0,
        Number(t.sold) || 0,
        Number(t.available) || 0,
        pct(Number(t.sellThrough) || 0),
        rupees(Number(t.revenue) || 0),
      ]),
    ],
  };

  const sponsorSheet: Sheet = {
    name: "Sponsors",
    rows: [
      ["Company", "Status", "Committed (₹)", "Received (₹)", "Outstanding (₹)"],
      ...sps.map((s) => {
        const committed = Number(s.sponsorshipAmount) || 0;
        const received = Number(s.receivedAmount) || 0;
        return [
          String(s.companyName ?? ""),
          String(s.status ?? ""),
          rupees(committed),
          rupees(received),
          rupees(Math.max(0, committed - received)),
        ];
      }),
    ],
  };

  return [summarySheet, eventsSheet, ticketSheet, sponsorSheet];
}

function downloadCsv(filename: string, rows: Cell[][]) {
  const esc = (v: Cell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetch the analytics for `festId` and download an .xlsx (or CSVs on failure). */
export async function exportFestWorkbook(festId: number): Promise<void> {
  const base = `${getApiUrl()}/api/events`;
  const [summary, events, ticketTypes, sponsors] = await Promise.all([
    fetchData(`${base}/analytics/fest/${festId}`),
    fetchData(`${base}/analytics/fest/${festId}/events`),
    fetchData(`${base}/analytics/fest/${festId}/ticket-types`),
    fetchData(`${base}/marketing/fest/${festId}/sponsors`),
  ]);

  const sheets = buildSheets(
    summary as Record<string, number> | null,
    events as Record<string, number | string>[] | null,
    ticketTypes as Record<string, number | string>[] | null,
    sponsors as Record<string, number | string>[] | null
  );

  try {
    // Dynamic import only — never a top-level import (Turbopack).
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(s.rows);
      XLSX.utils.book_append_sheet(wb, ws, s.name);
    }
    XLSX.writeFile(wb, `fest-${festId}-analytics.xlsx`);
  } catch (err) {
    // xlsx unavailable (e.g. bundler issue) — hand back the data as CSVs.
    console.error("xlsx export failed; falling back to CSV", err);
    for (const s of sheets) {
      downloadCsv(`fest-${festId}-${s.name.toLowerCase()}.csv`, s.rows);
    }
    showToast("Excel export unavailable — downloaded CSV files instead.", "info");
  }
}
