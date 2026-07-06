import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PaymentSidebar from "@/components/payment/PaymentSidebar";

// Mirror the component's own formatting so the assertion is timezone-agnostic.
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

describe("PaymentSidebar", () => {
  it("renders the summary heading, title, order id and formatted amount", () => {
    render(<PaymentSidebar title="Neon Night" amount={2500} orderId="order_123" />);
    expect(screen.getByText("Payment Summary")).toBeInTheDocument();
    expect(screen.getByText("Neon Night")).toBeInTheDocument();
    expect(screen.getByText("Order ID")).toBeInTheDocument();
    expect(screen.getByText("order_123")).toBeInTheDocument();
    expect(screen.getByText("Total Amount")).toBeInTheDocument();
    expect(screen.getByText("₹2,500")).toBeInTheDocument();
  });

  it("renders the secure-payment reassurance copy", () => {
    render(<PaymentSidebar title="Neon Night" amount={2500} orderId="order_123" />);
    expect(
      screen.getByText(/Payments are processed securely/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Secure payment")).toBeInTheDocument();
  });

  it("shows venue and formatted date separated by a dot when both are given", () => {
    const date = "2026-07-04T12:00:00";
    render(
      <PaymentSidebar title="Neon Night" amount={2500} orderId="order_123" venue="Main Arena" date={date} />
    );
    expect(screen.getByText("Main Arena")).toBeInTheDocument();
    expect(screen.getByText(formatDate(date))).toBeInTheDocument();
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("shows only the venue without a separator when date is absent", () => {
    render(
      <PaymentSidebar title="Neon Night" amount={2500} orderId="order_123" venue="Main Arena" />
    );
    expect(screen.getByText("Main Arena")).toBeInTheDocument();
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("shows only the formatted date without a separator when venue is absent", () => {
    const date = "2026-07-04T12:00:00";
    render(
      <PaymentSidebar title="Neon Night" amount={2500} orderId="order_123" date={date} />
    );
    expect(screen.getByText(formatDate(date))).toBeInTheDocument();
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("omits the venue/date line entirely when neither is given", () => {
    render(<PaymentSidebar title="Neon Night" amount={2500} orderId="order_123" />);
    expect(screen.queryByText("·")).not.toBeInTheDocument();
    expect(screen.queryByText("Main Arena")).not.toBeInTheDocument();
  });
});
