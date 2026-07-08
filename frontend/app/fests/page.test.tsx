import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// SEO-01: interactivity lives in the client island; the server page is covered
// by build/live checks.
import FestsListClient from "./FestsListClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

function festList(names: string[]) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function festsResponse(names: string[], pagination?: any) {
  return { ok: true, json: async () => ({ success: true, data: festList(names), ...(pagination ? { pagination } : {}) }) };
}
const P = (over = {}) => ({ page: 1, limit: 12, total: 2, totalPages: 1, ...over });

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("FestsListClient search + pagination", () => {
  it("renders the server-provided fests + result count without a client fetch", async () => {
    render(<FestsListClient initialFests={festList(["Alpha Fest", "Beta Fest"])} initialPagination={P()} />);
    expect(await screen.findByText("Alpha Fest")).toBeInTheDocument();
    expect(screen.getByText("Beta Fest")).toBeInTheDocument();
    expect(screen.getByText(/2 fests found/)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled(); // seeded from props
  });

  it("sends the typed search term to the API and shows filtered results", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(festsResponse(["Alpha Fest"], P({ total: 1 })));

    render(
      <FestsListClient initialFests={festList(["Alpha Fest", "Beta Fest"])} initialPagination={P()} />
    );
    await screen.findByText("Beta Fest");
    await userEvent.type(screen.getByLabelText("Search fests"), "Alpha");

    await waitFor(() => expect(screen.queryByText("Beta Fest")).not.toBeInTheDocument());
    expect(screen.getByText("Alpha Fest")).toBeInTheDocument();
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain("search=Alpha");
  });

  it("renders Prev/Next pagination and advances the page", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(festsResponse(["Page2 Fest"], P({ page: 2, total: 20, totalPages: 2 })));

    render(
      <FestsListClient initialFests={festList(["Page1 Fest"])} initialPagination={P({ total: 20, totalPages: 2 })} />
    );
    await screen.findByText("Page1 Fest");

    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Fests pagination" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page2 Fest")).toBeInTheDocument();
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain("page=2");
  });

  it("shows an empty state when there are no fests (genuine empty, no fetch)", async () => {
    render(<FestsListClient initialFests={[]} initialPagination={P({ total: 0, totalPages: 0 })} />);
    expect(await screen.findByText(/0 fests found/)).toBeInTheDocument();
    expect(screen.getByText(/No fests found/)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refetches on mount when the SSR render failed (initialFests=null) instead of sticking empty", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(festsResponse(["Recovered Fest"], P({ total: 1 })));

    // null => transient outage at render time; the island recovers rather than
    // showing a misleading "No fests found".
    render(<FestsListClient initialFests={null} initialPagination={null} />);

    expect(await screen.findByText("Recovered Fest")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
