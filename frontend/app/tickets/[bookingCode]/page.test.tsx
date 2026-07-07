import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TicketsPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ bookingCode: "BK1" }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ getApiUrl: () => "http://localhost:4000" }));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("TicketsPage (TIX-05)", () => {
  it("renders one printable ticket per attendee, each with a QR", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          bookingCode: "BK1",
          status: "COMPLETED",
          event: { name: "Spring Fest", startDate: "2026-05-01", venue: "Hall" },
          attendees: [
            { id: 11, name: "Alice", email: "a@x", ticketCode: "tkt_a", ticketType: "GA", checkedInAt: null },
            { id: 12, name: "Bob", email: "b@x", ticketCode: "tkt_b", ticketType: "VIP", checkedInAt: null },
          ],
        },
      }),
    });
    render(<TicketsPage />);
    const cards = await screen.findAllByTestId("printable-ticket");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("transfers a ticket to a new attendee and refetches (TIX-06)", async () => {
    const completedBooking = () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          bookingCode: "BK1",
          status: "COMPLETED",
          event: { name: "Spring Fest", startDate: "2026-05-01" },
          attendees: [{ id: 11, name: "Alice", email: "a@x", ticketCode: "tkt_a", ticketType: "GA", checkedInAt: null }],
        },
      }),
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(completedBooking())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { id: 11, ticketCode: "new" } }) })
      .mockResolvedValueOnce(completedBooking());

    render(<TicketsPage />);
    await screen.findAllByTestId("printable-ticket");
    await userEvent.click(screen.getByRole("button", { name: /transfer \/ edit attendee/i }));
    await userEvent.type(screen.getByLabelText("Name"), "New Person");
    await userEvent.type(screen.getByLabelText("Email"), "new@x.com");
    await userEvent.click(screen.getByRole("button", { name: "Transfer" }));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => String(c[0]).includes("/api/bookings/BK1/transfer")
        )
      ).toBe(true)
    );
  });

  it("falls back to a single order-level ticket when there are no attendees", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { bookingCode: "BK1", event: { name: "E" }, attendees: [], items: [{ quantity: 1, ticketType: { name: "GA" } }] },
      }),
    });
    render(<TicketsPage />);
    expect(await screen.findAllByTestId("printable-ticket")).toHaveLength(1);
  });

  it("shows a not-found state on an unknown code", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ success: false }) });
    render(<TicketsPage />);
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
