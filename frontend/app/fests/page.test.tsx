import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FestsPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

function festsResponse(names: string[], pagination?: any) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: names.map((name, i) => ({
        id: i + 1,
        name,
        college: "Some College",
        startDate: null,
        endDate: null,
        description: null,
        image: null,
      })),
      ...(pagination ? { pagination } : {}),
    }),
  };
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("FestsPage search + pagination", () => {
  it("loads fests and shows the result count from the pagination object", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      festsResponse(["Alpha Fest", "Beta Fest"], { page: 1, limit: 12, total: 2, totalPages: 1 })
    );

    render(<FestsPage />);

    expect(await screen.findByText("Alpha Fest")).toBeInTheDocument();
    expect(screen.getByText("Beta Fest")).toBeInTheDocument();
    expect(screen.getByText(/2 fests found/)).toBeInTheDocument();
  });

  it("sends the typed search term to the API and shows filtered results", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        festsResponse(["Alpha Fest", "Beta Fest"], { page: 1, limit: 12, total: 2, totalPages: 1 })
      )
      .mockResolvedValueOnce(
        festsResponse(["Alpha Fest"], { page: 1, limit: 12, total: 1, totalPages: 1 })
      );

    render(<FestsPage />);
    await screen.findByText("Beta Fest");

    await userEvent.type(screen.getByLabelText("Search fests"), "Alpha");

    await waitFor(() =>
      expect(screen.queryByText("Beta Fest")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Alpha Fest")).toBeInTheDocument();

    // The most recent request carried the search term.
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain("search=Alpha");
  });

  it("renders Prev/Next pagination and advances the page", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        festsResponse(["Page1 Fest"], { page: 1, limit: 12, total: 20, totalPages: 2 })
      )
      .mockResolvedValueOnce(
        festsResponse(["Page2 Fest"], { page: 2, limit: 12, total: 20, totalPages: 2 })
      );

    render(<FestsPage />);
    await screen.findByText("Page1 Fest");

    // Pagination controls carry clear accessible names and disabled semantics.
    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Fests pagination" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Page2 Fest")).toBeInTheDocument();
    const lastUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain("page=2");
  });

  it("shows an empty state when no fests match", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      festsResponse([], { page: 1, limit: 12, total: 0, totalPages: 0 })
    );

    render(<FestsPage />);
    expect(await screen.findByText(/0 fests found/)).toBeInTheDocument();
    expect(screen.getByText(/No fests found/)).toBeInTheDocument();
  });
});
