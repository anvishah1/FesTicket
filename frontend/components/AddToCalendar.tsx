"use client";

import React from "react";
import { getApiUrl } from "@/lib/auth";

const pad2 = (n: number) => String(n).padStart(2, "0");

// FLOATING local time (no Z): startTime is a naive wall-clock string and no
// timezone is stored, so emit the wall-clock value un-zoned. Google interprets a
// dates= value without a Z in the viewer's own calendar timezone, so an 18:00
// event stays 18:00 instead of being shifted by their UTC offset.
function gcalFloating(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}00`
  );
}
// All-day events use the date-only "YYYYMMDD/YYYYMMDD" form (end exclusive).
function gcalDateOnly(date: Date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
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
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const icsUrl = `${getApiUrl()}/api/events/${eventId}/calendar.ics`;

  let googleUrl = "";
  if (startDate) {
    const base = new Date(startDate);
    if (!Number.isNaN(base.getTime())) {
      const m = typeof startTime === "string" ? startTime.match(/^(\d{1,2}):(\d{2})/) : null;
      const start = new Date(base);
      if (m) start.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
      const hasTime = !!m || base.getUTCHours() !== 0 || base.getUTCMinutes() !== 0;

      let end = endDate ? new Date(endDate) : new Date(NaN);
      // Default/clamp: also fall back when the end isn't strictly after the start
      // (mirrors the .ics fix so DTEND never precedes DTSTART).
      if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
        end = new Date(start.getTime());
        if (hasTime) end.setUTCHours(end.getUTCHours() + 2);
        else end.setUTCDate(end.getUTCDate() + 1);
      }

      const dates = hasTime
        ? `${gcalFloating(start)}/${gcalFloating(end)}`
        : `${gcalDateOnly(start)}/${gcalDateOnly(end)}`;
      const params = new URLSearchParams({
        action: "TEMPLATE",
        text: name || "Event",
        dates,
        location: venue || "",
        details: description || "",
      });
      googleUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
    }
  }

  // Dismiss on outside click / Escape — the menu had no way to close except
  // re-clicking the button or picking an item.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    // z-30 so the menu paints over the cards that follow it in the document.
    <div className="relative inline-block z-30">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 py-1.5 rounded-md border border-[var(--border-card)] text-sm hover:bg-[var(--surface-slate)]"
      >
        Add to calendar ▾
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md bg-[var(--surface)] border border-[var(--border-card)] shadow-lg py-1 text-sm"
        >
          <a
            href={icsUrl}
            className="block px-3 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-slate-100)]"
            onClick={() => setOpen(false)}
          >
            Apple / Outlook (.ics)
          </a>
          {googleUrl && (
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-slate-100)]"
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
