import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NetbankingList from "@/components/payment/NetbankingList";

describe("NetbankingList", () => {
  it("renders the heading and the full bank list", () => {
    render(<NetbankingList amount={800} />);
    expect(screen.getByText("Net Banking")).toBeInTheDocument();
    for (const bank of [
      "State Bank of India",
      "HDFC Bank",
      "ICICI Netbanking",
      "Axis Bank",
      "AU Small Finance Bank",
      "Andhra Bank",
      "Bandhan Bank",
      "Bank of Baroda",
      "Canara Bank",
    ]) {
      expect(screen.getByText(bank)).toBeInTheDocument();
    }
  });

  it("disables the pay button until a bank is selected", async () => {
    const user = userEvent.setup();
    render(<NetbankingList amount={800} />);
    const payButton = screen.getByRole("button", { name: /Pay ₹800/ });
    expect(payButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /HDFC Bank/ }));
    expect(payButton).toBeEnabled();
  });

  it("marks the chosen bank as Selected", async () => {
    const user = userEvent.setup();
    render(<NetbankingList amount={800} />);
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Axis Bank/ }));
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("calls onPaymentComplete after proceeding with a selected bank", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<NetbankingList amount={800} onPaymentComplete={onPaymentComplete} />);

    await user.click(screen.getByRole("button", { name: /Canara Bank/ }));
    await user.click(screen.getByRole("button", { name: /Pay ₹800/ }));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it("falls back to a demo alert naming the bank when no callback is given", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<NetbankingList amount={800} />);

    await user.click(screen.getByRole("button", { name: /HDFC Bank/ }));
    await user.click(screen.getByRole("button", { name: /Pay ₹800/ }));
    await waitFor(
      () => expect(alertSpy).toHaveBeenCalledWith("Mock: Payment successful via HDFC Bank"),
      { timeout: 2500 }
    );
  });

  it("reflects the processing prop by disabling banks and the pay button", () => {
    render(<NetbankingList amount={800} processing />);
    const payButton = screen.getByRole("button", { name: "Processing…" });
    expect(payButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /HDFC Bank/ })).toBeDisabled();
  });
});
