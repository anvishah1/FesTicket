import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckinPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ eventId: "5" }) }));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
// Avoid loading the real camera library (browser-only) in jsdom.
vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    async start() {}
    async stop() {}
    clear() {}
  },
}));

const apiFetch = vi.fn();
let storedUser: { id: number; role: string; managedFestId?: number; editorFestId?: number } | null = { id: 7, role: "HOST" };
vi.mock("@/lib/auth", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  getStoredUser: () => storedUser,
  isAuthenticated: () => true,
  getApiUrl: () => "http://localhost:4000",
}));

const eventOk = () => ({
  ok: true,
  json: async () => ({ success: true, data: { id: 5, name: "Spring Fest", hostId: 7, festId: 3 } }),
});

beforeEach(() => {
  apiFetch.mockReset();
  storedUser = { id: 7, role: "HOST" };
});

describe("CheckinPage (TIX-03)", () => {
  it("shows access-denied for a caller who cannot manage the event", async () => {
    apiFetch.mockResolvedValueOnce(eventOk());
    storedUser = { id: 999, role: "VIEWER" };
    render(<CheckinPage />);
    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
  });

  it("admits via manual entry and shows a green ADMITTED banner", async () => {
    apiFetch
      .mockResolvedValueOnce(eventOk())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: "ADMITTED", attendee: { name: "Alice", ticketType: "GA" } } }),
      });
    render(<CheckinPage />);
    const input = await screen.findByLabelText("Ticket code");
    await userEvent.type(input, "tkt_alice");
    await userEvent.click(screen.getByRole("button", { name: "Admit" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/bookings/checkin", expect.objectContaining({ method: "POST" }))
    );
    const banner = await screen.findByTestId("checkin-result");
    expect(banner).toHaveTextContent("ADMITTED");
    expect(banner).toHaveTextContent("Alice · GA");
  });

  it("shows an amber ALREADY banner on a re-scan", async () => {
    apiFetch
      .mockResolvedValueOnce(eventOk())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: "ALREADY", attendee: { name: "Alice" }, checkedInAt: "2026-01-01T10:00:00Z" } }),
      });
    render(<CheckinPage />);
    const input = await screen.findByLabelText("Ticket code");
    await userEvent.type(input, "tkt_alice");
    await userEvent.click(screen.getByRole("button", { name: "Admit" }));
    expect(await screen.findByTestId("checkin-result")).toHaveTextContent("ALREADY CHECKED IN");
  });
});
