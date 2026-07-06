import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventsPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ festId: "1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

const FEST_EVENTS = [
  { id: 1, name: "Rock Night", category: "Music" },
  { id: 2, name: "Hack Day", category: "Tech" },
];

const LIST_EVENTS = [
  { id: 1, name: "Rock Night", category: "Music", startDate: "2026-08-01", venue: "Arena", image: null, discount: 20 },
  { id: 2, name: "Hack Day", category: "Tech", startDate: "2026-08-02", venue: "Lab", image: null, discount: 0 },
];

// URL-routing fetch mock: /api/fests/:id returns fest info + all events (for the
// category list); /api/events applies the search/category/page query params.
function installFetch(listEvents = LIST_EVENTS) {
  globalThis.fetch = vi.fn((url: string) => {
    if (url.includes("/api/fests/")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 1, name: "TechFest", college: "IIT", events: FEST_EVENTS },
        }),
      });
    }
    // /api/events
    const u = new URL(url, "http://localhost");
    const search = (u.searchParams.get("search") || "").toLowerCase();
    const category = u.searchParams.get("category");
    const page = Number(u.searchParams.get("page") || "1");
    let data = listEvents;
    if (search) data = data.filter((e) => e.name.toLowerCase().includes(search));
    if (category) data = data.filter((e) => (e.category || "Other") === category);
    return Promise.resolve({
      ok: true,
      json: async () => ({
        success: true,
        data,
        pagination: { page, limit: 12, total: data.length, totalPages: 1 },
      }),
    });
  }) as any;
}

beforeEach(() => {
  installFetch();
});

describe("Fest events discovery", () => {
  it("renders events with a discount badge on discounted cards", async () => {
    render(<EventsPage />);
    expect(await screen.findByText("Rock Night")).toBeInTheDocument();
    // Rock Night has discount 20 -> badge; Hack Day has 0 -> no badge.
    const badges = screen.getAllByTestId("discount-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("20% OFF");
  });

  it("filters the list by search term via the API", async () => {
    render(<EventsPage />);
    await screen.findByText("Hack Day");

    await userEvent.type(screen.getByLabelText("Search events"), "Rock");

    await waitFor(() => expect(screen.queryByText("Hack Day")).not.toBeInTheDocument());
    expect(screen.getByText("Rock Night")).toBeInTheDocument();

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain("search=Rock");
    expect(lastUrl).toContain("festId=1");
  });

  it("filters by category chip", async () => {
    render(<EventsPage />);
    await screen.findByText("Hack Day");

    // Category chips are derived from the fest's full event set.
    const techChip = screen.getByRole("button", { name: "Tech" });
    // Inactive chip reports its pressed state to AT.
    expect(techChip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(techChip);
    expect(techChip).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(screen.queryByText("Rock Night")).not.toBeInTheDocument());
    expect(screen.getByText("Hack Day")).toBeInTheDocument();

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain("category=Tech");
  });

  it("shows the result count", async () => {
    render(<EventsPage />);
    expect(await screen.findByText(/2 events found/)).toBeInTheDocument();
  });

  it("shows an empty state when filters match nothing", async () => {
    render(<EventsPage />);
    await screen.findByText("Hack Day");

    await userEvent.type(screen.getByLabelText("Search events"), "Zebra");

    expect(await screen.findByText(/No events match your filters/)).toBeInTheDocument();
  });
});
