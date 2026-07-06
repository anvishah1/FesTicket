import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  ticketTypes: [{ id: 1, name: "GA", price: 100, quantity: 50, sold: 0 }],
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
              purchaseDate: "2099-05-01T10:00:00.000Z",
            },
          ],
          stats: { totalRevenue: 0, totalTicketsSold: 0 },
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

  it("edits a ticket type via the PUT endpoint", async () => {
    render(<ManageEventPage />);
    await screen.findByRole("button", { name: "Publish" });
    // Enter ticket edit mode (pencil button titled "Edit ticket type").
    await userEvent.click(screen.getByRole("button", { name: /edit ticket type/i }));
    const priceInput = screen.getByLabelText("Ticket price");
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, "250");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(showToastMock).toHaveBeenCalledWith("Ticket type updated", "success");
    // The breakdown card reflects the new price.
    const breakdown = screen.getByText("Ticket Types Breakdown").closest("div")!;
    expect(within(breakdown).getByText("₹250")).toBeInTheDocument();
  });
});
