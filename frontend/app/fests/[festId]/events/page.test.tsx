import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// SEO-01: interactivity lives in the client island; the server page is covered
// by build/live checks.
import FestEventsClient from "./FestEventsClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

const LIST_EVENTS = [
  { id: 1, name: "Rock Night", category: "Music", startDate: "2026-08-01", venue: "Arena", image: null, discount: 20 },
  { id: 2, name: "Hack Day", category: "Tech", startDate: "2026-08-02", venue: "Lab", image: null, discount: 0 },
];

// The server page seeds the island with the fest (incl. its events) for the
// initial list + category chips; filter/sort/page interactions hit /api/events.
const initialFest = { id: 1, name: "TechFest", college: "IIT", events: LIST_EVENTS };

function installFetch(listEvents = LIST_EVENTS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    const search = (u.searchParams.get("search") || "").toLowerCase();
    const category = u.searchParams.get("category");
    const page = Number(u.searchParams.get("page") || "1");
    let data = listEvents;
    if (search) data = data.filter((e) => e.name.toLowerCase().includes(search));
    if (category) data = data.filter((e) => (e.category || "Other") === category);
    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true, data, pagination: { page, limit: 12, total: data.length, totalPages: 1 } }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

const renderIsland = () => render(<FestEventsClient festId={1} initialFest={initialFest} />);

beforeEach(() => {
  installFetch();
});

describe("Fest events discovery", () => {
  it("renders the server-provided events with a discount badge on discounted cards", async () => {
    renderIsland();
    expect(await screen.findByText("Rock Night")).toBeInTheDocument();
    const badges = screen.getAllByTestId("discount-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("20% OFF");
    // Seeded from props — no client fetch on first mount.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("filters the list by search term via the API", async () => {
    renderIsland();
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
    renderIsland();
    await screen.findByText("Hack Day");
    const techChip = screen.getByRole("button", { name: "Tech" });
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
    renderIsland();
    expect(await screen.findByText(/2 events found/)).toBeInTheDocument();
  });

  it("shows an empty state when filters match nothing", async () => {
    renderIsland();
    await screen.findByText("Hack Day");
    await userEvent.type(screen.getByLabelText("Search events"), "Zebra");
    expect(await screen.findByText(/No events match your filters/)).toBeInTheDocument();
  });
});
