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
          { id: 1, name: "General", price: 1000, quantity: 5, sold: 0 },
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
    expect(within(summary).getByText("-₹100")).toBeInTheDocument();

    // discountedBase 900 -> platformFee 18, tax round2((900+18)*0.18)=165.24,
    // total = 900 + 18 + 165.24 = 1083.24.
    expect(within(summary).getByText("₹18")).toBeInTheDocument();
    expect(within(summary).getByText("₹165.24")).toBeInTheDocument();
    expect(within(summary).getByText("₹1083.24")).toBeInTheDocument();
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

    const proceed = screen.getByRole("button", { name: /Proceed to Payment/i });
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

    await userEvent.click(screen.getByRole("button", { name: /Proceed to Payment/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(body.answers).toEqual([{ questionId: 5, value: "L" }]);
  });
});
