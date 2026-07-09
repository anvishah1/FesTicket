import { describe, it, expect } from "vitest";
import { buildEventIcs } from "../../src/utils/ics.js";

describe("buildEventIcs (TIX-09)", () => {
  const stamp = new Date("2026-01-01T00:00:00Z");

  it("returns null for an event with no usable start date", () => {
    expect(buildEventIcs({ id: 1, name: "E", startDate: null }, stamp)).toBeNull();
    expect(buildEventIcs({ id: 1, name: "E", startDate: "not-a-date" }, stamp)).toBeNull();
  });

  it("builds a timed VEVENT with FLOATING DTSTART/DTEND (no Z) and a +2h default end", () => {
    const ics = buildEventIcs(
      { id: 5, name: "Fest", startDate: "2026-05-01T00:00:00Z", startTime: "18:30", venue: "Hall" },
      stamp
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:event-5@FesTicket");
    // Floating local time (no Z): the wall-clock 18:30 must be preserved for the
    // importer, not declared as UTC (which would shift it by their offset).
    expect(ics).toContain("DTSTART:20260501T183000");
    expect(ics).toContain("DTEND:20260501T203000");
    expect(ics).not.toContain("DTSTART:20260501T183000Z");
    // DTSTAMP stays a real UTC instant.
    expect(ics).toContain("DTSTAMP:20260101T000000Z");
    expect(ics).toContain("SUMMARY:Fest");
    expect(ics).toContain("LOCATION:Hall");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("clamps DTEND to after DTSTART when a same-day, time-less endDate would precede it", () => {
    const ics = buildEventIcs(
      {
        id: 9,
        name: "Clamp",
        startDate: "2026-05-01T00:00:00Z",
        startTime: "18:00",
        endDate: "2026-05-01T00:00:00Z", // same day, no endTime -> would be 00:00
      },
      stamp
    );
    // Must NOT emit DTEND at 00:00 (before the 18:00 start); falls back to +2h.
    expect(ics).toContain("DTSTART:20260501T180000");
    expect(ics).toContain("DTEND:20260501T200000");
    expect(ics).not.toContain("DTEND:20260501T000000");
  });

  it("emits an all-day VALUE=DATE event when there is no time-of-day", () => {
    const ics = buildEventIcs({ id: 6, name: "All Day", startDate: "2026-05-01T00:00:00Z" }, stamp);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260501");
    expect(ics).toContain("DTEND;VALUE=DATE:20260502");
  });

  it("escapes commas/semicolons per RFC 5545", () => {
    const ics = buildEventIcs({ id: 7, name: "Rock, Pop; Jazz", startDate: "2026-05-01T10:00:00Z" }, stamp);
    expect(ics).toContain("SUMMARY:Rock\\, Pop\\; Jazz");
  });

  it("includes the online join link for an online event", () => {
    const ics = buildEventIcs(
      { id: 8, name: "Webinar", startDate: "2026-05-01T10:00:00Z", isOnline: true, onlineLink: "https://meet.example/x" },
      stamp
    );
    expect(ics).toContain("URL:https://meet.example/x");
    expect(ics).toContain("Join: https://meet.example/x");
  });
});
