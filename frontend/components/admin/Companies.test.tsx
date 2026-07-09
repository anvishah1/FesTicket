import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Companies from "@/components/admin/Companies";

// ANL-07 added a pipeline board that also lists sponsor names, so name queries
// are scoped to the existing left-hand list to stay unambiguous.
const inList = () => within(screen.getByTestId("sponsor-list"));

const sponsors = [
  {
    id: 1,
    companyName: "Acme Corp",
    contactPerson: "Alice",
    email: "alice@acme.com",
    sponsorshipAmount: 5000000,
    agreementUrl: "http://x/a.png",
    createdAt: "2026-01-02T00:00:00Z",
    agreementType: "IMAGE",
    status: "CONFIRMED",
  },
  {
    id: 2,
    companyName: "Beta LLC",
    contactPerson: "Bob",
    email: "bob@beta.com",
    sponsorshipAmount: 3000000,
    agreementUrl: "http://x/b.pdf",
    createdAt: "2026-01-05T00:00:00Z",
    agreementType: "PDF",
    status: "PENDING",
  },
];

function mockFetch(payload: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

describe("Companies", () => {
  beforeEach(() => {
    mockFetch({ success: true, data: sponsors });
  });

  it("fetches fest sponsors from the scoped marketing endpoint", async () => {
    render(<Companies festId={7} />);
    await inList().findByText("Acme Corp");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/events/marketing/fest/7/sponsors"),
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  it("renders sponsor cards and header stats from fetched data", async () => {
    render(<Companies festId={7} />);
    await inList().findByText("Acme Corp");
    expect(inList().getByText("Beta LLC")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();

    // Total Sponsors = 2
    expect(screen.getByText("Total Sponsors").nextElementSibling).toHaveTextContent("2");
    // Confirmed = 1 (only Acme is CONFIRMED). Scope to the stat tile <p> — the
    // pipeline board also has a "Confirmed" column heading.
    expect(screen.getByText("Confirmed", { selector: "p" }).nextElementSibling).toHaveTextContent("1");
    // Total Sponsorship (paise) = 5000000 + 3000000 = 8000000 = ₹80,000.00
    expect(screen.getByText("Total Sponsorship").nextElementSibling).toHaveTextContent("₹80,000.00");
  });

  it("shows the empty state when there are no sponsors", async () => {
    mockFetch({ success: true, data: [] });
    render(<Companies festId={7} />);
    expect(await screen.findByText("No sponsors found")).toBeInTheDocument();
  });

  it("shows the empty state when the request fails (res not ok)", async () => {
    mockFetch({ success: false }, false);
    render(<Companies festId={7} />);
    expect(await screen.findByText("No sponsors found")).toBeInTheDocument();
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("swallows a network error and stays on the empty state", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    render(<Companies festId={7} />);
    expect(await screen.findByText("No sponsors found")).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it("filters the list by the search box", async () => {
    render(<Companies festId={7} />);
    await inList().findByText("Acme Corp");
    await userEvent.type(
      screen.getByPlaceholderText("Search sponsors..."),
      "Beta"
    );
    expect(inList().getByText("Beta LLC")).toBeInTheDocument();
    expect(inList().queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("re-orders alphabetically when the sort is set to A → Z", async () => {
    render(<Companies festId={7} />);
    await inList().findByText("Acme Corp");
    // default sort is "recent": Beta (Jan 5) comes before Acme (Jan 2)
    const before = inList().getByText("Beta LLC");
    expect(
      before.compareDocumentPosition(inList().getByText("Acme Corp")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /sort sponsors/i }), "name-asc");
    const acme = inList().getByText("Acme Corp");
    const beta = inList().getByText("Beta LLC");
    expect(
      acme.compareDocumentPosition(beta) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows a placeholder until a sponsor is selected", async () => {
    render(<Companies festId={7} />);
    await inList().findByText("Acme Corp");
    expect(
      screen.getByText("Select a sponsor to view their agreement")
    ).toBeInTheDocument();
  });

  it("opens the agreement preview panel when a sponsor card is clicked", async () => {
    render(<Companies festId={7} />);
    const card = await inList().findByText("Acme Corp");
    await userEvent.click(card);
    // email only shows in the detail panel
    expect(screen.getByText("alice@acme.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Full Screen" })
    ).toBeInTheDocument();
    // Download is a real link to the agreement file (no longer a dead button)
    expect(
      screen.getByRole("link", { name: "Download Agreement" })
    ).toHaveAttribute("href", "http://x/a.png");
    // image-type agreement renders an <img alt="Agreement">
    expect(screen.getByAltText("Agreement")).toBeInTheDocument();
  });

  it("hides the agreement viewer/actions and shows a no-agreement state when agreementUrl is missing", async () => {
    mockFetch({
      success: true,
      data: [
        {
          id: 3,
          companyName: "Gamma Inc",
          contactPerson: "Carol",
          email: "carol@gamma.com",
          sponsorshipAmount: 1000000,
          agreementUrl: "",
          createdAt: "2026-01-10T00:00:00Z",
          agreementType: "IMAGE",
          status: "PENDING",
        },
      ],
    });
    render(<Companies festId={7} />);
    await userEvent.click(await inList().findByText("Gamma Inc"));
    // Detail panel opens (email is only in the detail panel)
    expect(screen.getByText("carol@gamma.com")).toBeInTheDocument();
    // ...but every agreement affordance is hidden
    expect(
      screen.queryByRole("button", { name: "Full Screen" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download Agreement" })
    ).not.toBeInTheDocument();
    expect(screen.queryByAltText("Agreement")).not.toBeInTheDocument();
    // ...and an honest empty state is shown instead
    expect(screen.getByText(/no agreement uploaded/i)).toBeInTheDocument();
  });

  it("fetches a hosted agreement through the authenticated files route (L3)", async () => {
    // A stored /uploads/<name> path is no longer served publicly — the component
    // fetches it through the authed marketing-files route and shows it via a blob.
    const blob = new Blob(["x"], { type: "image/png" });
    const g = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ ...sponsors[0], agreementUrl: "/uploads/a.png" }] }),
      })
      .mockResolvedValue({ ok: true, blob: async () => blob });
    globalThis.fetch = g as unknown as typeof fetch;
    URL.createObjectURL = vi.fn(() => "blob:mock") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    render(<Companies festId={7} />);
    await userEvent.click(await inList().findByText("Acme Corp"));

    await waitFor(() =>
      expect(g).toHaveBeenCalledWith(
        expect.stringContaining("/api/events/marketing/files/a.png"),
        expect.anything()
      )
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Agreement" })).toHaveAttribute("href", "blob:mock")
    );
  });

  it("opens and closes the full-screen zoom modal", async () => {
    render(<Companies festId={7} />);
    await userEvent.click(await inList().findByText("Acme Corp"));
    await userEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    expect(screen.getByText("Acme Corp - Agreement")).toBeInTheDocument();
  });

  it("labels the search box and sort control (WCAG 1.3.1/4.1.2)", async () => {
    render(<Companies festId={7} />);
    await inList().findByText("Acme Corp");
    expect(screen.getByRole("textbox", { name: /search sponsors/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /sort sponsors/i })).toBeInTheDocument();
  });

  it("gives the search-clear button an accessible name", async () => {
    render(<Companies festId={7} />);
    await userEvent.type(
      await screen.findByRole("textbox", { name: /search sponsors/i }),
      "Beta"
    );
    expect(
      screen.getByRole("button", { name: /clear search/i })
    ).toBeInTheDocument();
  });

  it("exposes the zoom modal as a labelled dialog with a named close button", async () => {
    render(<Companies festId={7} />);
    await userEvent.click(await inList().findByText("Acme Corp"));
    await userEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "agreement-zoom-title");
    expect(
      screen.getByRole("button", { name: /close agreement preview/i })
    ).toBeInTheDocument();
  });
});
