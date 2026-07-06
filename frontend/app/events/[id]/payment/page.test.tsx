import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PaymentPage from "./page";

const push = vi.fn();
let search = new URLSearchParams("bookingCode=BK-DISC");
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => search,
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/payment/PaymentSidebar", () => ({ default: () => <aside /> }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

function bookingResponse({ discount }: { discount: number }) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      // All money is INTEGER PAISE (PAY-03): 100000 paise = ₹1000.00.
      data: {
        id: 1,
        bookingCode: "BK-DISC",
        status: "PENDING",
        subtotal: 100000,
        discount,
        platformFee: 1800,
        tax: 16524,
        total: 108324,
        event: { name: "Fest Night", venue: "Hall", startDate: "2026-08-01" },
        items: [{ quantity: 1, ticketType: { name: "General", price: 100000 } }],
      },
    }),
  };
}

beforeEach(() => {
  search = new URLSearchParams("bookingCode=BK-DISC");
  globalThis.fetch = vi.fn();
});

describe("PaymentPage discount line", () => {
  it("renders a discount line in the order summary when the booking has a discount", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      bookingResponse({ discount: 10000 })
    );

    render(<PaymentPage />);

    const line = await screen.findByTestId("payment-discount-line");
    // 10000 / 100000 = 10%
    expect(within(line).getByText(/Discount \(10%\)/)).toBeInTheDocument();
    expect(within(line).getByText("-₹100.00")).toBeInTheDocument();
  });

  it("omits the discount line when there is no discount", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      bookingResponse({ discount: 0 })
    );

    render(<PaymentPage />);

    // Wait for the summary to render.
    await screen.findByText("Order Summary");
    expect(screen.queryByTestId("payment-discount-line")).not.toBeInTheDocument();
  });
});
