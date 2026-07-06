import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UPIForm from "@/components/payment/UPIForm";

describe("UPIForm", () => {
  it("renders the intro, the UPI id input and both entry points", () => {
    render(<UPIForm amount={150000} orderId="order_1" />);
    expect(screen.getByText("Pay by any UPI app")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate QR Code" })).toBeInTheDocument();
    expect(screen.getByLabelText("UPI ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay ₹1,500/ })).toBeInTheDocument();
  });

  it("shows the QR panel after clicking Generate QR Code", async () => {
    const user = userEvent.setup();
    render(<UPIForm amount={150000} orderId="order_1" />);
    await user.click(screen.getByRole("button", { name: "Generate QR Code" }));

    expect(screen.getByText("Scan this QR code using your UPI app")).toBeInTheDocument();
    expect(screen.getByText("Amount: ₹1,500.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I have paid" })).toBeInTheDocument();
    // The entry inputs are replaced by the QR panel.
    expect(screen.queryByLabelText("UPI ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate QR Code" })).not.toBeInTheDocument();
  });

  it("alerts and does not complete when paying with an empty UPI id", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onPaymentComplete = vi.fn();
    render(<UPIForm amount={150000} orderId="order_1" onPaymentComplete={onPaymentComplete} />);

    await user.click(screen.getByRole("button", { name: /Pay ₹1,500/ }));
    expect(alertSpy).toHaveBeenCalledWith("Please enter a valid UPI ID or use QR code.");
    expect(onPaymentComplete).not.toHaveBeenCalled();
  });

  it("calls onPaymentComplete after verifying a filled UPI id", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<UPIForm amount={150000} orderId="order_1" onPaymentComplete={onPaymentComplete} />);

    await user.type(screen.getByLabelText("UPI ID"), "alice@okbank");
    await user.click(screen.getByRole("button", { name: /Pay ₹1,500/ }));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it("calls onPaymentComplete from the QR 'I have paid' flow", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<UPIForm amount={150000} orderId="order_1" onPaymentComplete={onPaymentComplete} />);

    await user.click(screen.getByRole("button", { name: "Generate QR Code" }));
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it("falls back to a demo alert on QR payment when no callback is given", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<UPIForm amount={150000} orderId="order_1" />);

    await user.click(screen.getByRole("button", { name: "Generate QR Code" }));
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await waitFor(
      () => expect(alertSpy).toHaveBeenCalledWith("Mock: UPI QR scanned & paid (demo)."),
      { timeout: 2500 }
    );
  });

  it("reflects the processing prop on the pay button", () => {
    render(<UPIForm amount={150000} orderId="order_1" processing />);
    const button = screen.getByRole("button", { name: "Verifying…" });
    expect(button).toBeDisabled();
  });
});
