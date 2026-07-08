import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import FestsListClient, { type Fest, type Pagination } from "./FestsListClient";

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

function festList(names: string[]): Fest[] {
  return names.map((name, i) => ({
    id: i + 1,
    name,
    college: "Some College",
    startDate: null,
    endDate: null,
    description: null,
    image: null,
  }));
}

// FE-02: the island is now SWR-backed. Each response is the {success,data,pagination}
// envelope; SWR revalidates on mount, so the fetch mock must answer every call.
function respond(names: string[], pagination?: Pagination) {
  return { ok: true, json: async () => ({ success: true, data: festList(names), ...(pagination ? { pagination } : {}) }) };
}
const P = (over: Partial<Pagination> = {}): Pagination => ({ page: 1, limit: 12, total: 2, totalPages: 1, ...over });

// Fresh SWR cache per test so cached keys never bleed across tests.
function renderSWR(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);
}

beforeEach(() => {
  push.mockReset();
  // Default: every fetch returns the two seeded fests (covers SWR revalidation).
  globalThis.fetch = vi.fn().mockResolvedValue(respond(["Alpha Fest", "Beta Fest"], P()));
});

describe("FestsListClient (SWR) search + pagination", () => {
  it("renders the server-seeded fests from SWR fallbackData (no loading flash) + result count", async () => {
    renderSWR(<FestsListClient initialFests={festList(["Alpha Fest", "Beta Fest"])} initialPagination={P()} />);
    // Seed is served from fallbackData — never a "Loading fests..." state.
    expect(screen.queryByText(/Loading fests/)).not.toBeInTheDocument();
    expect(await screen.findByText("Alpha Fest")).toBeInTheDocument();
    expect(screen.getByText("Beta Fest")).toBeInTheDocument();
    expect(screen.getByText(/2 fests found/)).toBeInTheDocument();
  });

  it("sends the typed search term to the API and shows filtered results", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string | URL) =>
      Promise.resolve(
        String(url).includes("search=Alpha")
          ? respond(["Alpha Fest"], P({ total: 1 }))
          : respond(["Alpha Fest", "Beta Fest"], P())
      )
    );

    renderSWR(<FestsListClient initialFests={festList(["Alpha Fest", "Beta Fest"])} initialPagination={P()} />);
    await screen.findByText("Beta Fest");
    await userEvent.type(screen.getByLabelText("Search fests"), "Alpha");

    await waitFor(() => expect(screen.queryByText("Beta Fest")).not.toBeInTheDocument());
    expect(screen.getByText("Alpha Fest")).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("search=Alpha"))).toBe(true);
  });

  it("renders Prev/Next pagination and advances the page", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string | URL) =>
      Promise.resolve(
        String(url).includes("page=2")
          ? respond(["Page2 Fest"], P({ page: 2, total: 20, totalPages: 2 }))
          : respond(["Page1 Fest"], P({ total: 20, totalPages: 2 }))
      )
    );

    renderSWR(
      <FestsListClient initialFests={festList(["Page1 Fest"])} initialPagination={P({ total: 20, totalPages: 2 })} />
    );
    await screen.findByText("Page1 Fest");

    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Page2 Fest")).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("page=2"))).toBe(true);
  });

  it("shows an empty state when there are genuinely no fests", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(respond([], P({ total: 0, totalPages: 0 })));
    renderSWR(<FestsListClient initialFests={[]} initialPagination={P({ total: 0, totalPages: 0 })} />);
    expect(await screen.findByText(/0 fests found/)).toBeInTheDocument();
    expect(screen.getByText(/No fests found/)).toBeInTheDocument();
  });

  it("recovers by fetching on mount when the SSR render failed (initialFests=null)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(respond(["Recovered Fest"], P({ total: 1 })))
    );
    renderSWR(<FestsListClient initialFests={null} initialPagination={null} />);
    expect(await screen.findByText("Recovered Fest")).toBeInTheDocument();
  });
});
