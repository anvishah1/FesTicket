import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BookingSummary from "@/components/BookingSummary";

const items = [
  { id: "1", name: "General", price: 500, available: 5, qty: 2 },
  { id: "2", name: "VIP", price: 1000, available: 3, qty: 0 },
];

describe("BookingSummary", () => {
  it("renders only items with qty > 0 and hides qty 0 items", () => {
    render(
      <BookingSummary
        items={items}
        subtotal={999}
        platformFee={20}
        tax={180}
        total={1199}
      />
    );
    expect(screen.getByText("General")).toBeInTheDocument();
    // VIP has qty 0 and is filtered out
    expect(screen.queryByText("VIP")).not.toBeInTheDocument();
  });

  it("shows per-item quantity, unit price and computed line total", () => {
    render(
      <BookingSummary
        items={items}
        subtotal={999}
        platformFee={20}
        tax={180}
        total={1199}
      />
    );
    // "Qty 2 × ₹500.00"
    expect(screen.getByText(/Qty 2/)).toBeInTheDocument();
    // line total = qty * price = 2 * 500 = 1000
    expect(screen.getByText("₹1,000.00")).toBeInTheDocument();
  });

  it("renders subtotal, platform fee, tax and total from props", () => {
    render(
      <BookingSummary
        items={items}
        subtotal={999}
        platformFee={20}
        tax={180}
        total={1199}
      />
    );
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("₹999.00")).toBeInTheDocument();
    expect(screen.getByText("Platform fee")).toBeInTheDocument();
    expect(screen.getByText("₹20.00")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
    expect(screen.getByText("₹180.00")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("₹1,199.00")).toBeInTheDocument();
  });

  it("still renders the totals block when no item has a positive quantity", () => {
    render(
      <BookingSummary
        items={[{ id: "1", name: "General", price: 500, available: 5, qty: 0 }]}
        subtotal={0}
        platformFee={0}
        tax={0}
        total={0}
      />
    );
    expect(screen.queryByText("General")).not.toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    // subtotal, platform fee, tax and total all render ₹0.00 (4 occurrences)
    expect(screen.getAllByText("₹0.00")).toHaveLength(4);
  });
});
