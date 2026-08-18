import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/events/1/booking",
}));

// Trivial chrome / non-essential children so the test targets the summary math.
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
// Fillable stub: a button that populates valid attendees so the submit gate
// depends only on the piece under test (guest email + custom questions).
vi.mock("@/components/AttendeeForm", () => ({
  default: ({ requiredCount, onChange }: { requiredCount: number; onChange: (a: any[]) => void }) => (
    <>
      <button
        type="button"
        data-testid="fill-attendees"
        onClick={() =>
          onChange(
            Array.from({ length: requiredCount }, (_, i) => ({
              name: `Attendee ${i + 1}`,
              email: `attendee${i + 1}@example.com`,
            }))
          )
        }
      >
        fill attendees
      </button>
      {/* The real AttendeeForm has a per-row "Remove" button, which can leave
          attendees.length < requiredCount. */}
      <button type="button" data-testid="remove-all-attendees" onClick={() => onChange([])}>
        remove attendees
      </button>
      <button
        type="button"
        data-testid="fill-attendees-bad-email"
        onClick={() =>
          onChange(
            Array.from({ length: requiredCount }, (_, i) => ({
              name: `Attendee ${i + 1}`,
              email: "not-an-email",
            }))
          )
        }
      >
        fill attendees with a bad email
      </button>
    </>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

function eventResponse(discount: number, questions?: any[]) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        id: 1,
        name: "Fest Night",
        venue: "Main Hall",
        startDate: "2026-08-01",
        endDate: "2026-08-01",
        image: "",
        discount,
        ...(questions ? { questions } : {}),
        ticketTypes: [
          // price is INTEGER PAISE (PAY-03): 100000 paise = ₹1000.00.
          { id: 1, name: "General", price: 100000, quantity: 5, sold: 0 },
        ],
      },
    }),
  };
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("BookingPage discount display (M8)", () => {
  it("shows an itemized discount line and the discounted total matching the backend", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(eventResponse(10));

    render(<BookingPage />);

    // Wait for the event to load and the ticket to render.
    await screen.findByText("General");

    // Select 1 General ticket (₹1000 subtotal).
    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));

    const summary = await screen.findByTestId("booking-summary-discount");

    // Discount line: 10% of ₹1000 = ₹100.
    expect(within(summary).getByText(/Discount \(10%\)/)).toBeInTheDocument();
    expect(within(summary).getByText("-₹100.00")).toBeInTheDocument();

    // discountedBase 900 -> platformFee 18, tax round2((900+18)*0.18)=165.24,
    // total = 900 + 18 + 165.24 = 1083.24.
    expect(within(summary).getByText("₹18.00")).toBeInTheDocument();
    expect(within(summary).getByText("₹165.24")).toBeInTheDocument();
    expect(within(summary).getByText("₹1,083.24")).toBeInTheDocument();
  });

  it("renders the standard summary (no discount line) when the event has no discount", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(eventResponse(0));

    render(<BookingPage />);
    await screen.findByText("General");
    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));

    await waitFor(() =>
      expect(screen.getByText("Platform fee")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("booking-summary-discount")).not.toBeInTheDocument();
    expect(screen.queryByText(/Discount \(/)).not.toBeInTheDocument();
  });
});

// A disabled Proceed button MUST always say why. Removing an attendee row fails the
// `attendees.length === requiredAttendees` clause of isValid, which had no message
// branch — so the warning box rendered EMPTY and the button was dead with no reason.
describe("BookingPage submit-blocked messaging", () => {
  const setup = async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(eventResponse(0));
    render(<BookingPage />);
    await screen.findByText("General");
    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));
    await userEvent.type(screen.getByPlaceholderText("your@email.com"), "guest@example.com");
    await userEvent.click(screen.getByTestId("fill-attendees"));
  };
  const proceed = () => screen.getAllByRole("button", { name: /Proceed to Payment/i })[0];

  it("explains WHY the button is disabled when an attendee row is removed", async () => {
    await setup();
    expect(proceed()).toBeEnabled();

    await userEvent.click(screen.getByTestId("remove-all-attendees"));

    expect(proceed()).toBeDisabled();
    // Previously: an empty amber box. Now it names the shortfall.
    expect(screen.getByText(/0 of 1 added/i)).toBeInTheDocument();
  });

  it("never shows an EMPTY warning box while the button is disabled", async () => {
    await setup();
    await userEvent.click(screen.getByTestId("remove-all-attendees"));

    expect(proceed()).toBeDisabled();
    const box = document.querySelector("div.text-amber-600");
    expect(box).toBeTruthy();
    expect(box!.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("still reports a missing attendee NAME", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(eventResponse(0));
    render(<BookingPage />);
    await screen.findByText("General");
    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));
    await userEvent.type(screen.getByPlaceholderText("your@email.com"), "guest@example.com");
    // attendees default to the right COUNT but blank fields
    expect(proceed()).toBeDisabled();
    expect(screen.getByText(/fill in the NAME/i)).toBeInTheDocument();
  });

  it("blocks submit and explains WHY when an attendee's email is not a valid address", async () => {
    await setup();
    expect(proceed()).toBeEnabled();

    await userEvent.click(screen.getByTestId("fill-attendees-bad-email"));

    expect(proceed()).toBeDisabled();
    expect(screen.getByText(/valid email address for every attendee/i)).toBeInTheDocument();
  });
});

describe("BookingPage custom questions (C4)", () => {
  const questions = [
    { id: 5, label: "T-shirt size", type: "text", required: true, order: 0 },
    { id: 6, label: "Any notes?", type: "textarea", required: false, order: 1 },
  ];

  it("renders no additional-questions section when the event has none", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(eventResponse(0));
    render(<BookingPage />);
    await screen.findByText("General");
    expect(screen.queryByTestId("custom-questions")).not.toBeInTheDocument();
  });

  it("renders an input per question and blocks submit until required ones are answered", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      eventResponse(0, questions)
    );
    render(<BookingPage />);
    await screen.findByText("General");

    // Both questions render; the textarea (optional) and text (required) exist.
    expect(screen.getByLabelText(/T-shirt size/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Any notes\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));
    await userEvent.type(screen.getByPlaceholderText("your@email.com"), "guest@example.com");
    await userEvent.click(screen.getByTestId("fill-attendees"));

    const proceed = screen.getAllByRole("button", { name: /Proceed to Payment/i })[0];
    // Required "T-shirt size" still blank -> submit blocked.
    expect(proceed).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/T-shirt size/), "M");
    expect(proceed).toBeEnabled();
  });

  it("includes answered questions as { questionId, value } in the booking POST body", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(eventResponse(0, questions))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 99, bookingCode: "BK99", total: 1000 },
        }),
      });

    render(<BookingPage />);
    await screen.findByText("General");

    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));
    await userEvent.type(screen.getByPlaceholderText("your@email.com"), "guest@example.com");
    await userEvent.click(screen.getByTestId("fill-attendees"));
    await userEvent.type(screen.getByLabelText(/T-shirt size/), "L");
    // Leave the optional question blank; it must be filtered out of the payload.

    await userEvent.click(screen.getAllByRole("button", { name: /Proceed to Payment/i })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(body.answers).toEqual([{ questionId: 5, value: "L" }]);
  });
});

describe("BookingPage promo code (PAY-04)", () => {
  it("applies a promo code, shows the discount, and sends promoCode in the booking POST", async () => {
    const fetchMock = vi.fn((url: unknown, opts?: RequestInit) => {
      const u = String(url);
      const method = opts?.method || "GET";
      if (u.includes("/api/bookings/validate-promo")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { valid: true, promoDiscount: 2000, kind: "PERCENT" },
          }),
        });
      }
      if (u.includes("/api/bookings") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 99, bookingCode: "BK99", total: 100000, status: "PENDING" },
          }),
        });
      }
      // Default: the event GET (no event-level discount).
      return Promise.resolve(eventResponse(0));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<BookingPage />);
    await screen.findByText("General");

    // Select 1 General ticket (₹1000 subtotal).
    await userEvent.click(screen.getByRole("button", { name: /increase general/i }));

    // Apply a promo code.
    await userEvent.type(screen.getByLabelText("Promo code"), "SAVE20");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    // The applied line shows the promo code and its −₹20.00 discount (2000 paise).
    const applied = await screen.findByTestId("promo-applied");
    expect(within(applied).getByText(/Promo \(SAVE20\)/)).toBeInTheDocument();
    expect(within(applied).getByText(/₹20\.00/)).toBeInTheDocument();

    // Complete the remaining required fields and submit.
    await userEvent.type(screen.getByPlaceholderText("your@email.com"), "guest@example.com");
    await userEvent.click(screen.getByTestId("fill-attendees"));
    await userEvent.click(screen.getAllByRole("button", { name: /Proceed to Payment/i })[0]);

    // The booking POST body carries promoCode.
    await waitFor(() => {
      const bookingCall = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes("/api/bookings") &&
          !String(c[0]).includes("validate-promo") &&
          (c[1] as RequestInit | undefined)?.method === "POST"
      );
      expect(bookingCall).toBeTruthy();
    });
    const bookingCall = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).includes("/api/bookings") &&
        !String(c[0]).includes("validate-promo") &&
        (c[1] as RequestInit | undefined)?.method === "POST"
    );
    const bookingBody = JSON.parse((bookingCall![1] as RequestInit).body as string);
    expect(bookingBody.promoCode).toBe("SAVE20");
  });
});

describe("BookingPage fetch failure vs. genuinely missing event", () => {
  it("shows a retryable error (not 'Event not found') on a server error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: { code: "SERVER_ERROR" } }),
    });

    render(<BookingPage />);

    await screen.findByText(/something went wrong/i);
    expect(screen.queryByText(/event not found/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows 'Event not found' (not an error) when the backend genuinely 404s", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: { code: "NOT_FOUND" } }),
    });

    render(<BookingPage />);

    await screen.findByText(/event not found/i);
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});
