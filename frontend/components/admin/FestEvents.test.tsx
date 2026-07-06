import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FestEvents from "@/components/admin/FestEvents";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const events = [
  {
    id: 10,
    name: "Rock Night",
    venue: "Main Stage",
    startDate: "2026-03-10",
    startTime: "18:00",
    image: "http://img/rock.jpg",
    ticketTypes: [
      { sold: 30, quantity: 100 },
      { sold: 20, quantity: 50 },
    ],
  },
  {
    id: 11,
    name: "Hack Day",
    venue: "Lab",
    startDate: "2026-03-12",
    startTime: "09:00",
    ticketTypes: [{ sold: 10, quantity: 40 }],
  },
];

function mockFetch(payload: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

describe("FestEvents", () => {
  beforeEach(() => {
    mockFetch({ success: true, data: events });
  });

  it("shows a loading skeleton before the fetch resolves", () => {
    globalThis.fetch = vi
      .fn()
      .mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<FestEvents festId={1} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("All Events")).not.toBeInTheDocument();
  });

  it("fetches events for the given fest id", async () => {
    render(<FestEvents festId={4} />);
    await screen.findByText("Rock Night");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/events?festId=4"),
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  it("renders event cards and location from mapped data", async () => {
    render(<FestEvents festId={4} />);
    await screen.findByText("Rock Night");
    expect(screen.getByText("Hack Day")).toBeInTheDocument();
    expect(screen.getByText("Main Stage")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
  });

  it("computes summary stats (events, tickets sold, capacity filled)", async () => {
    render(<FestEvents festId={4} />);
    await screen.findByText("Rock Night");
    expect(screen.getByText("Total Events").nextElementSibling).toHaveTextContent("2");
    // total sold = 30 + 20 + 10 = 60
    expect(
      screen.getByText("Total Tickets Sold").nextElementSibling
    ).toHaveTextContent((60).toLocaleString());
    // capacity = 150 + 40 = 190, filled = round(60/190*100) = 32%
    expect(screen.getByText("Capacity Filled").nextElementSibling).toHaveTextContent("32%");
  });

  it("navigates to the manage page when a card is clicked", async () => {
    render(<FestEvents festId={4} />);
    await userEvent.click(await screen.findByText("Rock Night"));
    expect(push).toHaveBeenCalledWith(
      "/host/events/10/manage?from=admin"
    );
  });

  it("exposes each event card as a keyboard-operable button (WCAG 2.1.1/4.1.2)", async () => {
    render(<FestEvents festId={4} />);
    await screen.findByText("Rock Night");
    const card = screen.getByRole("button", { name: /manage event rock night/i });
    expect(card).toHaveAttribute("tabindex", "0");
    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/host/events/10/manage?from=admin");
  });

  it("renders the event's effective status on the badge", async () => {
    mockFetch({
      success: true,
      data: [{ ...events[0], effectiveStatus: "LIVE" }, events[1]],
    });
    render(<FestEvents festId={4} />);
    await screen.findByText("Rock Night");
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows the zeroed empty state when there are no events", async () => {
    mockFetch({ success: true, data: [] });
    render(<FestEvents festId={4} />);
    expect(
      await screen.findByText("No events found for this fest.")
    ).toBeInTheDocument();
    expect(screen.getByText("Total Events").nextElementSibling).toHaveTextContent("0");
  });

  it("falls back to the empty state when the request fails", async () => {
    mockFetch({ success: false }, false);
    render(<FestEvents festId={4} />);
    expect(
      await screen.findByText("No events found for this fest.")
    ).toBeInTheDocument();
  });

  it("falls back to the empty state on a network error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    render(<FestEvents festId={4} />);
    expect(
      await screen.findByText("No events found for this fest.")
    ).toBeInTheDocument();
    errSpy.mockRestore();
  });
});
