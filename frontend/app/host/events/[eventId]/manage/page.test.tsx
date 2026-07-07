import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ManageEventPage from "@/app/host/events/[eventId]/manage/page";

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: showToastMock }));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ eventId: "5" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

const baseEvent = {
  id: 5,
  name: "Test Event",
  hostId: 3,
  festId: 9,
  status: "DRAFT",
  effectiveStatus: "DRAFT",
  startDate: "2099-05-01",
  startTime: "18:00",
  venue: "Arena",
  category: "Music",
  description: "desc",
  discount: 0,
  // price is INTEGER PAISE (PAY-03): 25000 paise = ₹250.00.
  ticketTypes: [{ id: 1, name: "GA", price: 25000, quantity: 50, sold: 0 }],
};

const resp = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Promise<Response>;

let deleteStatus = 409;
let deleteBody: unknown = { success: false, error: { code: "HAS_BOOKINGS" } };

function installFetch() {
  globalThis.fetch = vi.fn((url: unknown, opts?: RequestInit) => {
    const u = String(url);
    const method = opts?.method || "GET";
    if (u.includes("/api/events/promo-codes/") && method === "DELETE") {
      return resp({ success: true });
    }
    if (u.includes("/api/events/promo-codes") && method === "POST") {
      const b = JSON.parse(String(opts?.body || "{}"));
      return resp({ success: true, data: { id: 10, code: b.code } });
    }
    if (u.includes("/api/events/promo-codes")) {
      return resp({
        success: true,
        data: [
          {
            id: 7,
            code: "SAVE20",
            kind: "PERCENT",
            percentOff: 20,
            flatOffPaise: null,
            maxRedemptions: 100,
            redeemedCount: 3,
            active: true,
            expiresAt: null,
          },
        ],
      });
    }
    if (u.includes("/api/events/5/status")) {
      return resp({ success: true, data: { status: "PUBLISHED", effectiveStatus: "UPCOMING" } });
    }
    if (u.includes("/api/events/5/ticket-types/1")) {
      const b = JSON.parse(String(opts?.body || "{}"));
      return resp({ success: true, data: { id: 1, name: b.name, price: b.price, quantity: b.quantity } });
    }
    if (u.includes("/api/events/5") && method === "DELETE") {
      return resp(deleteBody, deleteStatus);
    }
    if (u.includes("/api/bookings/1/refund") && method === "POST") {
      return resp({ success: true, data: { status: "REFUNDED" }, message: "Booking fully refunded" });
    }
    if (u.includes("/api/bookings/checkin") && method === "POST") {
      return resp({ success: true, data: { status: "ADMITTED", checkedInAt: "2026-02-02T09:00:00Z" } });
    }
    if (u.includes("/api/bookings/event/5")) {
      return resp({
        success: true,
        data: {
          bookings: [
            {
              id: 1,
              bookingCode: "BK-1",
              status: "COMPLETED",
              buyerName: "Alice",
              buyerEmail: "alice@x.com",
              buyerPhone: "111",
              tickets: [{ type: "GA", quantity: 2 }],
              totalTickets: 2,
              total: 200,
              refundedAmount: 0,
              purchaseDate: "2099-05-01T10:00:00.000Z",
              attendees: [
                { id: 11, ticketCode: "tkt_alice", name: "Alice A", email: "aa@x.com", ticketType: "GA", checkedInAt: null },
                { id: 12, ticketCode: "tkt_bob", name: "Bob B", email: "bb@x.com", ticketType: "GA", checkedInAt: "2026-01-01T10:00:00Z" },
              ],
            },
          ],
          stats: { totalRevenue: 0, totalTicketsSold: 0, attendeeCount: 2, admittedCount: 1 },
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        },
      });
    }
    if (u.includes("/api/events/5")) {
      return resp({ success: true, data: baseEvent });
    }
    return resp({ success: true, data: {} });
  }) as unknown as typeof fetch;
}

describe("ManageEventPage", () => {
  beforeEach(() => {
    showToastMock.mockClear();
    push.mockClear();
    deleteStatus = 409;
    deleteBody = { success: false, error: { code: "HAS_BOOKINGS" } };
    window.localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 3, email: "h@x.edu", role: "EDITOR", profileCompleted: true, editorFestId: 9 })
    );
    window.localStorage.setItem("auth_accessToken", "tok");
    installFetch();
    window.confirm = vi.fn(() => true);
  });

  it("publishes a draft event and reflects the new status", async () => {
    render(<ManageEventPage />);
    const publishBtn = await screen.findByRole("button", { name: "Publish" });
    await userEvent.click(publishBtn);
    // Badge now shows the derived lifecycle status returned by the PATCH.
    expect(await screen.findByText("Upcoming")).toBeInTheDocument();
    // Toggle flips to Unpublish.
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith("Event published", "success");
  });

  it("shows a cancel-instead message when deleting an event with bookings (409)", async () => {
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("cancel it instead"),
      "error"
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("deletes an event with no bookings and navigates away", async () => {
    deleteStatus = 200;
    deleteBody = { success: true };
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(showToastMock).toHaveBeenCalledWith("Event deleted", "success");
    expect(push).toHaveBeenCalledWith("/host/dashboard");
  });

  it("labels the inline edit-event form fields (WCAG 1.3.1/4.1.2)", async () => {
    render(<ManageEventPage />);
    await userEvent.click(await screen.findByRole("button", { name: /edit event/i }));
    expect(screen.getByLabelText("Event name")).toBeInTheDocument();
    expect(screen.getByLabelText("Event date")).toBeInTheDocument();
    expect(screen.getByLabelText("Event time")).toBeInTheDocument();
    expect(screen.getByLabelText("Venue")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
  });

  it("gives the buyers table column headers (scope=col)", async () => {
    render(<ManageEventPage />);
    await userEvent.click(await screen.findByRole("button", { name: /ticket buyers/i }));
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(7);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("edits a ticket type: pre-fills rupees, posts paise, shows the new price", async () => {
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    // Enter ticket edit mode (pencil button titled "Edit ticket type").
    await userEvent.click(screen.getByRole("button", { name: /edit ticket type/i }));
    const priceInput = screen.getByLabelText("Ticket price");
    // Stored price is 25000 paise → the input pre-fills as ₹250 (rupees).
    expect(priceInput).toHaveValue(250);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, "300");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(showToastMock).toHaveBeenCalledWith("Ticket type updated", "success");
    // The PUT body carries integer paise (₹300 → 30000).
    const putCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) =>
        String(c[0]).includes("/api/events/5/ticket-types/1") &&
        (c[1] as RequestInit | undefined)?.method === "PUT"
    );
    expect(putCall).toBeTruthy();
    const putBody = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(putBody.price).toBe(30000);
    // The breakdown card reflects the new price.
    const breakdown = screen.getByText("Ticket Types Breakdown").closest("div")!;
    expect(within(breakdown).getByText("₹300.00")).toBeInTheDocument();
  });

  it("issues a full refund from the buyers table (PAY-02)", async () => {
    render(<ManageEventPage />);
    await userEvent.click(await screen.findByRole("button", { name: /ticket buyers/i }));
    // Row action opens the refund modal (defaults to a full refund).
    await userEvent.click(await screen.findByRole("button", { name: "Refund" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm Refund" }));
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Booking fully refunded", "success")
    );
    // The refund POST hit /api/bookings/1/refund.
    const refundCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) =>
        String(c[0]).includes("/api/bookings/1/refund") &&
        (c[1] as RequestInit | undefined)?.method === "POST"
    );
    expect(refundCall).toBeTruthy();
    // Modal closes on success.
    expect(screen.queryByText("Issue Refund")).not.toBeInTheDocument();
  });

  it("lists promo codes and creates a new one (PAY-04)", async () => {
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    // Open the Promo Codes tab -> fetches and lists existing codes.
    await userEvent.click(screen.getByRole("button", { name: "Promo Codes" }));
    expect(await screen.findByText("SAVE20")).toBeInTheDocument();

    // Fill and submit the create form.
    await userEvent.type(screen.getByLabelText("Promo code"), "NEW10");
    await userEvent.type(screen.getByLabelText("Percent off"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Create Promo Code" }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Promo code created", "success")
    );
    // The create POST hit /api/events/promo-codes with the right body.
    const postCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) =>
        String(c[0]).includes("/api/events/promo-codes") &&
        (c[1] as RequestInit | undefined)?.method === "POST"
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({ eventId: 5, code: "NEW10", kind: "PERCENT", percentOff: 10 });
  });

  it("deletes a promo code (PAY-04)", async () => {
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    await userEvent.click(screen.getByRole("button", { name: "Promo Codes" }));
    const row = (await screen.findByText("SAVE20")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Promo code deleted", "success")
    );
    const delCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) =>
        String(c[0]).includes("/api/events/promo-codes/7") &&
        (c[1] as RequestInit | undefined)?.method === "DELETE"
    );
    expect(delCall).toBeTruthy();
  });

  it("shows the check-in tab with admitted counts and admits an attendee (TIX-04)", async () => {
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    await userEvent.click(screen.getByRole("button", { name: "Check-in" }));

    // 1 of 2 attendees already admitted (Bob), Alice not yet.
    expect(await screen.findByTestId("admitted-count")).toHaveTextContent("1 / 2");
    const aliceRow = screen.getByText("Alice A").closest("li")!;
    await userEvent.click(within(aliceRow).getByRole("button", { name: "Admit" }));

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Admitted", "success"));
    // Alice now admitted -> counter climbs to 2 / 2.
    await waitFor(() => expect(screen.getByTestId("admitted-count")).toHaveTextContent("2 / 2"));
  });
});
