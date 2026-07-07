import { describe, it, expect } from "vitest";
import { buildEventIcs } from "../../src/utils/ics.js";

describe("buildEventIcs (TIX-09)", () => {
  const stamp = new Date("2026-01-01T00:00:00Z");

  it("returns null for an event with no usable start date", () => {
    expect(buildEventIcs({ id: 1, name: "E", startDate: null }, stamp)).toBeNull();
    expect(buildEventIcs({ id: 1, name: "E", startDate: "not-a-date" }, stamp)).toBeNull();
  });

  it("builds a timed VEVENT with DTSTART/DTEND in UTC and a +2h default end", () => {
    const ics = buildEventIcs(
      { id: 5, name: "Fest", startDate: "2026-05-01T00:00:00Z", startTime: "18:30", venue: "Hall" },
      stamp
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:event-5@tiqr");
    expect(ics).toContain("DTSTART:20260501T183000Z");
    expect(ics).toContain("DTEND:20260501T203000Z");
    expect(ics).toContain("SUMMARY:Fest");
    expect(ics).toContain("LOCATION:Hall");
    expect(ics.endsWith("\r\n")).toBe(true);
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
