import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingsPage from "./page";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const showToast = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: (...a: unknown[]) => showToast(...a) }));

const getStoredUser = vi.fn();
const isAuthenticated = vi.fn();
const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  getStoredUser: () => getStoredUser(),
  isAuthenticated: () => isAuthenticated(),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  getApiUrl: () => "http://localhost:4000",
}));

beforeEach(() => {
  getStoredUser.mockReset();
  isAuthenticated.mockReset();
  apiFetch.mockReset();
  showToast.mockReset();
  globalThis.fetch = vi.fn();
});

describe("BookingsPage (signed in)", () => {
  beforeEach(() => {
    isAuthenticated.mockReturnValue(true);
    getStoredUser.mockReturnValue({ id: 7, email: "u@example.com", role: "VIEWER" });
  });

  it("lists the user's bookings", async () => {
    apiFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: [
          {
            id: 1,
            bookingCode: "BK-1",
            status: "COMPLETED",
            total: 1083.24,
            event: { name: "Fest Night", startDate: "2026-08-01", venue: "Hall" },
            items: [{ quantity: 2, ticketType: { name: "General", price: 500 } }],
          },
          {
            id: 2,
            bookingCode: "BK-2",
            status: "PENDING",
            total: 500,
            event: { name: "Comedy Show", startDate: "2026-09-01" },
            items: [{ quantity: 1, ticketType: { name: "VIP", price: 500 } }],
          },
        ],
      }),
    });

    render(<BookingsPage />);

    expect(await screen.findByText("Fest Night")).toBeInTheDocument();
    expect(screen.getByText("Comedy Show")).toBeInTheDocument();
    expect(screen.getByText("BK-1")).toBeInTheDocument();
    expect(screen.getAllByTestId("booking-card")).toHaveLength(2);
    expect(apiFetch).toHaveBeenCalledWith("/api/bookings/user/7");
  });

  it("requests a refund on a completed booking and reflects the new status (PAY-06)", async () => {
    apiFetch
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: [
            {
              id: 1,
              bookingCode: "BK-1",
              status: "COMPLETED",
              total: 1000,
              event: { name: "Fest Night", startDate: "2026-08-01" },
              items: [],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Booking fully refunded", data: { status: "REFUNDED" } }),
      });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BookingsPage />);
    const btn = await screen.findByRole("button", { name: "Request refund" });
    await userEvent.click(btn);

    expect(apiFetch).toHaveBeenCalledWith("/api/bookings/1/request-refund", { method: "POST" });
    expect(showToast).toHaveBeenCalledWith("Booking fully refunded", "success");
    expect(await screen.findByText("REFUNDED")).toBeInTheDocument();
  });

  it("shows an empty state when the user has no bookings", async () => {
    apiFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: [] }),
    });

    render(<BookingsPage />);

    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No bookings yet")).toBeInTheDocument();
  });
});

describe("BookingsPage (guest)", () => {
  beforeEach(() => {
    isAuthenticated.mockReturnValue(false);
    getStoredUser.mockReturnValue(null);
  });

  it("shows a booking-code lookup form and does not call the user endpoint", async () => {
    render(<BookingsPage />);

    expect(await screen.findByText("Look up a booking")).toBeInTheDocument();
    expect(screen.getByLabelText("Booking code")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
