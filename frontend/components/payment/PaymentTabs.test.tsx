import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentTabs from "@/components/payment/PaymentTabs";

describe("PaymentTabs", () => {
  it("renders the three payment tabs", () => {
    render(<PaymentTabs amount={100000} orderId="order_1" />);
    expect(screen.getByRole("button", { name: "UPI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Netbanking" })).toBeInTheDocument();
  });

  it("shows the UPI form by default", () => {
    render(<PaymentTabs amount={100000} orderId="order_1" />);
    expect(screen.getByText("Pay by any UPI app")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate QR Code" })).toBeInTheDocument();
  });

  it("switches to the Cards form when the Cards tab is clicked", async () => {
    const user = userEvent.setup();
    render(<PaymentTabs amount={100000} orderId="order_1" />);
    await user.click(screen.getByRole("button", { name: "Cards" }));

    expect(screen.getByText("Enter Card Details")).toBeInTheDocument();
    expect(screen.queryByText("Pay by any UPI app")).not.toBeInTheDocument();
  });

  it("switches to the Netbanking list when the Netbanking tab is clicked", async () => {
    const user = userEvent.setup();
    render(<PaymentTabs amount={100000} orderId="order_1" />);
    await user.click(screen.getByRole("button", { name: "Netbanking" }));

    expect(screen.getByText("Net Banking")).toBeInTheDocument();
    expect(screen.getByText("HDFC Bank")).toBeInTheDocument();
  });

  it("passes the amount down to the active form", () => {
    render(<PaymentTabs amount={123400} orderId="order_1" />);
    expect(screen.getByRole("button", { name: /Pay ₹1,234/ })).toBeInTheDocument();
  });

  it("forwards onPaymentComplete with 'UPI' from the QR flow", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<PaymentTabs amount={100000} orderId="order_1" onPaymentComplete={onPaymentComplete} />);

    await user.click(screen.getByRole("button", { name: "Generate QR Code" }));
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledWith("UPI"), { timeout: 2500 });
  });

  it("forwards onPaymentComplete with 'NETBANKING' from the netbanking flow", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<PaymentTabs amount={100000} orderId="order_1" onPaymentComplete={onPaymentComplete} />);

    await user.click(screen.getByRole("button", { name: "Netbanking" }));
    await user.click(screen.getByRole("button", { name: /HDFC Bank/ }));
    await user.click(screen.getByRole("button", { name: /Pay ₹1,000/ }));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledWith("NETBANKING"), {
      timeout: 2500,
    });
  });

  it("forwards onPaymentComplete with 'CARD' from the card flow", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<PaymentTabs amount={100000} orderId="order_1" onPaymentComplete={onPaymentComplete} />);

    await user.click(screen.getByRole("button", { name: "Cards" }));
    await user.type(screen.getByPlaceholderText("Enter Card Number"), "411111111111");
    await user.type(screen.getByPlaceholderText("MM/YY"), "12/29");
    await user.type(screen.getByPlaceholderText("CVV"), "123");
    await user.click(screen.getByRole("button", { name: /Pay ₹1,000/ }));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledWith("CARD"), { timeout: 2500 });
  });
});
