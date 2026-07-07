import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmationPage from "./page";

let search = new URLSearchParams("bookingCode=BK-ABC123");
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const showToast = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: (...a: unknown[]) => showToast(...a) }));

function bookingResponse() {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        id: 42,
        bookingCode: "BK-ABC123",
        status: "COMPLETED",
        subtotal: 100000,
        total: 108324,
        event: { name: "Fest Night", venue: "Main Hall", startDate: "2026-08-01" },
        items: [{ quantity: 2, ticketType: { name: "General", price: 50000 } }],
        attendees: [
          { name: "Alice", email: "alice@example.com" },
          { name: "Bob", email: "bob@example.com" },
        ],
      },
    }),
  };
}

beforeEach(() => {
  search = new URLSearchParams("bookingCode=BK-ABC123");
  globalThis.fetch = vi.fn();
});

describe("BookingConfirmationPage", () => {
  it("shows the booking code, event, tickets and total", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bookingResponse());

    render(<ConfirmationPage />);

    expect(await screen.findByText("Booking confirmed!")).toBeInTheDocument();
    expect(screen.getByTestId("booking-code")).toHaveTextContent("BK-ABC123");
    expect(screen.getByText("Fest Night")).toBeInTheDocument();
    expect(screen.getByText(/General × 2/)).toBeInTheDocument();
    expect(screen.getByTestId("confirmation-total")).toHaveTextContent("1,083.24");
    // Attendees listed
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // TIX-01: a scannable QR of the booking code is rendered.
    expect(screen.getByTestId("booking-qr").querySelector("svg")).toBeTruthy();
  });

  it("links to my bookings", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bookingResponse());
    render(<ConfirmationPage />);
    await screen.findByText("Booking confirmed!");
    const link = screen.getByRole("link", { name: /view my bookings/i });
    expect(link).toHaveAttribute("href", "/bookings");
  });

  it("copies the booking code to the clipboard", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bookingResponse());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ConfirmationPage />);
    await screen.findByText("Booking confirmed!");

    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("BK-ABC123");
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Booking code copied", "success"));
  });

  it("shows a not-found state when no code is provided", async () => {
    search = new URLSearchParams();
    render(<ConfirmationPage />);
    expect(await screen.findByText("Booking not found")).toBeInTheDocument();
  });
});
