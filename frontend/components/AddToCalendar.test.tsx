import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddToCalendar from "./AddToCalendar";

vi.mock("@/lib/auth", () => ({ getApiUrl: () => "http://localhost:4000" }));

describe("AddToCalendar (TIX-09)", () => {
  it("offers an .ics download and a prefilled Google Calendar link", async () => {
    render(<AddToCalendar eventId={5} name="Fest" startDate="2026-05-01T00:00:00Z" startTime="18:30" venue="Hall" />);
    await userEvent.click(screen.getByRole("button", { name: /add to calendar/i }));

    expect(screen.getByRole("link", { name: /apple \/ outlook/i })).toHaveAttribute(
      "href",
      "http://localhost:4000/api/events/5/calendar.ics"
    );
    const google = screen.getByRole("link", { name: /google calendar/i });
    expect(google.getAttribute("href")).toContain("calendar.google.com/calendar/render");
    expect(google.getAttribute("href")).toContain("20260501T183000Z"); // start in UTC
  });

  it("omits the Google link when there is no start date", async () => {
    render(<AddToCalendar eventId={5} name="Fest" startDate={null} />);
    await userEvent.click(screen.getByRole("button", { name: /add to calendar/i }));
    expect(screen.queryByRole("link", { name: /google calendar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /apple \/ outlook/i })).toBeInTheDocument();
  });
});
