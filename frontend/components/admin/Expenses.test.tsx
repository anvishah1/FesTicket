import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Expenses from "@/components/admin/Expenses";

const expenses = [
  {
    id: 1,
    hostId: 3,
    description: "Stage lights",
    category: "INFRASTRUCTURE",
    vendor: "LightCo",
    amount: 20000,
    paymentDate: "2026-02-01T00:00:00Z",
    paymentMethod: "UPI",
    notes: "urgent",
    files: [
      { fileType: "PROOF", fileName: "proof1.png", fileSize: 2048, mimeType: "image/png" },
      { fileType: "BILL", fileName: "bill1.pdf", fileSize: 4096, mimeType: "application/pdf" },
    ],
    createdAt: "2026-02-01T00:00:00Z",
    fest: { name: "TechFest" },
  },
  {
    id: 2,
    hostId: 5,
    description: "Posters",
    category: "MARKETING",
    vendor: "PrintHub",
    amount: 5000,
    paymentDate: "2026-02-03T00:00:00Z",
    paymentMethod: "Cash",
    notes: "",
    files: [],
    createdAt: "2026-02-03T00:00:00Z",
    fest: { name: "TechFest" },
  },
];

function mockFetch(payload: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

function comboByOption(optionText: string) {
  return screen
    .getAllByRole("combobox")
    .find((c) => within(c).queryByText(optionText))!;
}

describe("Expenses", () => {
  beforeEach(() => {
    mockFetch({ success: true, data: expenses });
  });

  it("fetches expenses from the fest-scoped endpoint", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/events/marketing/fest/9/expenses"),
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  it("renders expense rows with mapped host label and vendor", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    expect(screen.getByText("Posters")).toBeInTheDocument();
    expect(screen.getByText("LightCo")).toBeInTheDocument();
    // With no host object on the expense, hostName falls back to "Host #<hostId>".
    // The label also appears in the host-filter <option>, so scope to the table rows.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Host #3")).toBeInTheDocument();
    expect(within(table).getByText("Host #5")).toBeInTheDocument();
    // The raw backend enum (INFRASTRUCTURE / MARKETING) is normalized to a human label.
    expect(within(table).getByText("Infrastructure")).toBeInTheDocument();
    expect(within(table).getByText("Marketing")).toBeInTheDocument();
  });

  it("prefers the host's real name/email over the Host #id fallback", async () => {
    mockFetch({
      success: true,
      data: [
        { ...expenses[0], hostId: 3, host: { name: "Dr. Rao", email: "rao@x.edu" } },
        { ...expenses[1], hostId: 5, host: { email: "only@x.edu" } },
      ],
    });
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Dr. Rao")).toBeInTheDocument();
    expect(within(table).getByText("only@x.edu")).toBeInTheDocument();
    expect(within(table).queryByText("Host #3")).not.toBeInTheDocument();
  });

  it("computes the summary stats from filtered data", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    // Total Expenses = 20000 + 5000
    expect(screen.getByText("₹25,000.00")).toBeInTheDocument();
    expect(screen.getByText("Total Entries").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Hosts Reporting").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Categories Used").nextElementSibling).toHaveTextContent("2");
  });

  it("shows the empty state when no expenses match", async () => {
    mockFetch({ success: true, data: [] });
    render(<Expenses festId={9} />);
    expect(
      await screen.findByText("No expenses found matching your filters")
    ).toBeInTheDocument();
  });

  it("renders the empty state when the request fails", async () => {
    mockFetch({ success: false }, false);
    render(<Expenses festId={9} />);
    expect(
      await screen.findByText("No expenses found matching your filters")
    ).toBeInTheDocument();
  });

  it("filters rows via the search box", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    await userEvent.type(
      screen.getByPlaceholderText("Search by description, vendor, or host..."),
      "Posters"
    );
    expect(screen.getByText("Posters")).toBeInTheDocument();
    expect(screen.queryByText("Stage lights")).not.toBeInTheDocument();
  });

  it("filters rows via the category dropdown", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    await userEvent.selectOptions(comboByOption("All Categories"), "Marketing");
    expect(screen.getByText("Posters")).toBeInTheDocument();
    expect(screen.queryByText("Stage lights")).not.toBeInTheDocument();
  });

  it("filters rows via the host dropdown", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    await userEvent.selectOptions(comboByOption("All Hosts"), "Host #5");
    expect(screen.getByText("Posters")).toBeInTheDocument();
    expect(screen.queryByText("Stage lights")).not.toBeInTheDocument();
  });

  it("shows a placeholder until a row is selected", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    expect(
      screen.getByText("Select an expense to view details")
    ).toBeInTheDocument();
  });

  it("opens the detail panel when a row is clicked", async () => {
    render(<Expenses festId={9} />);
    await userEvent.click(await screen.findByText("Stage lights"));
    expect(screen.getByText("Expense Details")).toBeInTheDocument();
    // payment method only appears in the detail panel
    expect(screen.getByText("UPI")).toBeInTheDocument();
    expect(screen.getByText("proof1.png")).toBeInTheDocument();
    expect(screen.getByText("bill1.pdf")).toBeInTheDocument();
  });

  it("renders an Export CSV control", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    expect(
      screen.getByRole("button", { name: /export csv/i })
    ).toBeInTheDocument();
  });

  it("generates and downloads a CSV of the filtered rows", async () => {
    const createUrl = vi.fn(() => "blob:mock");
    const revokeUrl = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createUrl;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeUrl;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("exposes accessible names for the search box and filter selects (WCAG 1.3.1/4.1.2)", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    expect(screen.getByRole("textbox", { name: /search expenses/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /filter by host/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /filter by category/i })).toBeInTheDocument();
  });

  it("gives the expenses table column headers (scope=col)", async () => {
    render(<Expenses festId={9} />);
    await screen.findByText("Stage lights");
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(6);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("makes expense rows keyboard-operable (Enter opens the detail panel)", async () => {
    render(<Expenses festId={9} />);
    const row = (await screen.findByText("Stage lights")).closest("tr")!;
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-label", expect.stringContaining("Stage lights"));
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("Expense Details")).toBeInTheDocument();
  });

  it("labels the detail-panel close button", async () => {
    render(<Expenses festId={9} />);
    await userEvent.click(await screen.findByText("Stage lights"));
    expect(
      screen.getByRole("button", { name: /close expense details/i })
    ).toBeInTheDocument();
  });

  it("opens a stored proof file through the authenticated files route (L3)", async () => {
    // Stored /uploads/<name> files are streamed through the authed marketing-files
    // route (not a public mount); clicking the file fetches it with the bearer token.
    const blob = new Blob(["x"], { type: "image/png" });
    const g = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              ...expenses[0],
              files: [
                { fileType: "PROOF", fileName: "p.png", fileSize: 10, mimeType: "image/png", fileUrl: "/uploads/p.png" },
              ],
            },
          ],
        }),
      })
      .mockResolvedValue({ ok: true, blob: async () => blob });
    globalThis.fetch = g as unknown as typeof fetch;
    URL.createObjectURL = vi.fn(() => "blob:mock") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    render(<Expenses festId={9} />);
    await userEvent.click(await screen.findByText("Stage lights"));
    await userEvent.click(screen.getByText("p.png"));

    await waitFor(() =>
      expect(g).toHaveBeenCalledWith(
        expect.stringContaining("/api/events/marketing/files/p.png"),
        expect.anything()
      )
    );
  });
});
