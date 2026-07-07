// TIX-09: build a standards-compliant (RFC 5545) VCALENDAR/VEVENT string for an
// event. No dependency. Times are emitted in UTC (…Z) to avoid off-by-hours; when
// no usable time is present we fall back to an all-day VALUE=DATE event.

// Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, and newlines.
function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// "YYYYMMDDTHHMMSSZ" (UTC) for a datetime, or "YYYYMMDD" for an all-day date.
function toUtcStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}
function toDateOnly(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}`;
}

// Compose a start Date from Event.startDate (+ optional "HH:MM" startTime). Returns
// { date, hasTime } or null when startDate is unusable.
function composeStart(startDate, startTime) {
  if (!startDate) return null;
  const base = new Date(startDate);
  if (Number.isNaN(base.getTime())) return null;
  const m = typeof startTime === "string" ? startTime.match(/^(\d{1,2}):(\d{2})/) : null;
  if (m) {
    const d = new Date(base);
    d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
    return { date: d, hasTime: true };
  }
  // startDate may itself carry a time-of-day (datetime string).
  const hasTime = base.getUTCHours() !== 0 || base.getUTCMinutes() !== 0;
  return { date: base, hasTime };
}

// Build the .ics body. `stamp` is the DTSTAMP "now" (injected so callers control
// determinism). Returns a string, or null when the event has no usable start date.
export function buildEventIcs(event, stamp = new Date()) {
  const start = composeStart(event.startDate, event.startTime);
  if (!start) return null;

  // End: use endDate/endTime if present, else +2h (timed) or +1 day (all-day).
  let end = null;
  if (event.endDate) {
    const composedEnd = composeStart(event.endDate, event.endTime);
    if (composedEnd) end = composedEnd.date;
  }
  if (!end) {
    end = new Date(start.date);
    if (start.hasTime) end.setUTCHours(end.getUTCHours() + 2);
    else end.setUTCDate(end.getUTCDate() + 1);
  }

  const location = event.venueAddress || event.venue || (event.onlineLink ? "Online" : "");
  const descParts = [];
  if (event.description) descParts.push(event.description);
  if (event.isOnline && event.onlineLink) descParts.push(`Join: ${event.onlineLink}`);
  const description = descParts.join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tiqr//events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@tiqr`,
    `DTSTAMP:${toUtcStamp(stamp)}`,
    start.hasTime ? `DTSTART:${toUtcStamp(start.date)}` : `DTSTART;VALUE=DATE:${toDateOnly(start.date)}`,
    start.hasTime ? `DTEND:${toUtcStamp(end)}` : `DTEND;VALUE=DATE:${toDateOnly(end)}`,
    `SUMMARY:${escapeText(event.name || "Event")}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    event.onlineLink ? `URL:${escapeText(event.onlineLink)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  // RFC 5545 uses CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}
