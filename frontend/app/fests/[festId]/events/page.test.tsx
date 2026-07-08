import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
// SEO-01: interactivity lives in the client island; the server page is covered
// by build/live checks. FE-02: the island is now SWR-backed.
import FestEventsClient from "./FestEventsClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
// Keep useApi real but stub the FE-08 prefetch (its preload writes to SWR's
// default global cache, which would bleed across tests).
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  prefetchApi: vi.fn(),
}));

const LIST_EVENTS = [
  { id: 1, name: "Rock Night", category: "Music", startDate: "2026-08-01", venue: "Arena", image: null, discount: 20 },
  { id: 2, name: "Hack Day", category: "Tech", startDate: "2026-08-02", venue: "Lab", image: null, discount: 0 },
];

const initialFest = { id: 1, name: "TechFest", college: "IIT", events: LIST_EVENTS };

// Mock both endpoints: GET /api/fests/:id returns the fest object; GET /api/events
// returns the (filtered) events list. SWR revalidates on mount, so every call is
// answered.
function installFetch(listEvents = LIST_EVENTS) {
  globalThis.fetch = vi.fn((url: string | URL) => {
    const u = new URL(String(url), "http://localhost");
    if (/\/api\/fests\/\d+/.test(u.pathname)) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: initialFest }) });
    }
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

const renderIsland = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FestEventsClient festId={1} initialFest={initialFest} />
    </SWRConfig>
  );

beforeEach(() => {
  push.mockReset();
  installFetch();
});

function eventsUrls() {
  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/events"));
}

describe("Fest events discovery (SWR)", () => {
  it("renders the server-seeded events with a discount badge on discounted cards", async () => {
    renderIsland();
    expect(await screen.findByText("Rock Night")).toBeInTheDocument();
    const badges = screen.getAllByTestId("discount-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("20% OFF");
  });

  it("filters the list by search term via the API", async () => {
    renderIsland();
    await screen.findByText("Hack Day");
    await userEvent.type(screen.getByLabelText("Search events"), "Rock");

    await waitFor(() => expect(screen.queryByText("Hack Day")).not.toBeInTheDocument());
    expect(screen.getByText("Rock Night")).toBeInTheDocument();
    const urls = eventsUrls();
    expect(urls.some((u) => u.includes("search=Rock") && u.includes("festId=1"))).toBe(true);
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
    expect(eventsUrls().some((u) => u.includes("category=Tech"))).toBe(true);
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
