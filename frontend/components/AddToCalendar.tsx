"use client";

import React from "react";
import { getApiUrl } from "@/lib/auth";

function gcalStamp(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}00Z`
  );
}

// TIX-09: add-to-calendar dropdown. Apple/Outlook download the backend .ics;
// Google opens a prefilled calendar.google.com/render template built client-side.
export default function AddToCalendar({
  eventId,
  name,
  startDate,
  startTime,
  endDate,
  venue,
  description,
}: {
  eventId: number;
  name?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  venue?: string | null;
  description?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const icsUrl = `${getApiUrl()}/api/events/${eventId}/calendar.ics`;

  let googleUrl = "";
  if (startDate) {
    const base = new Date(startDate);
    if (!Number.isNaN(base.getTime())) {
      const m = typeof startTime === "string" ? startTime.match(/^(\d{1,2}):(\d{2})/) : null;
      const start = new Date(base);
      if (m) start.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
      let end = endDate ? new Date(endDate) : new Date(NaN);
      if (Number.isNaN(end.getTime())) end = new Date(start.getTime() + 2 * 3600 * 1000);
      const params = new URLSearchParams({
        action: "TEMPLATE",
        text: name || "Event",
        dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
        location: venue || "",
        details: description || "",
      });
      googleUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 py-1.5 rounded-md border text-sm hover:bg-slate-50"
      >
        Add to calendar ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-48 rounded-md bg-white border shadow-lg py-1 text-sm" role="menu">
          <a href={icsUrl} className="block px-3 py-2 hover:bg-slate-100" onClick={() => setOpen(false)}>
            Apple / Outlook (.ics)
          </a>
          {googleUrl && (
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              Google Calendar
            </a>
          )}
        </div>
      )}
    </div>
  );
}
