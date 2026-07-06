import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardForm from "@/components/payment/CardForm";

// Fills the three inputs with a set of card values.
async function fillCard(
  user: ReturnType<typeof userEvent.setup>,
  { number, expiry, cvv }: { number: string; expiry: string; cvv: string }
) {
  if (number) await user.type(screen.getByPlaceholderText("Enter Card Number"), number);
  if (expiry) await user.type(screen.getByPlaceholderText("MM/YY"), expiry);
  if (cvv) await user.type(screen.getByPlaceholderText("CVV"), cvv);
}

describe("CardForm", () => {
  it("renders the heading, field labels and the pay button with the amount", () => {
    render(<CardForm amount={2500} />);
    expect(screen.getByText("Enter Card Details")).toBeInTheDocument();
    expect(screen.getByText("Card number")).toBeInTheDocument();
    expect(screen.getByText("Expiry (MM/YY)")).toBeInTheDocument();
    expect(screen.getByText("CVV")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Pay ₹2,500");
  });

  it("disables the pay button until card details are valid", async () => {
    const user = userEvent.setup();
    render(<CardForm amount={100} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    // 12 digits + expiry + 3-digit cvv => valid
    await fillCard(user, { number: "411111111111", expiry: "12/29", cvv: "123" });
    expect(button).toBeEnabled();
  });

  it("keeps the button disabled when the card number is too short", async () => {
    const user = userEvent.setup();
    render(<CardForm amount={100} />);
    // only 11 digits (needs >= 12)
    await fillCard(user, { number: "41111111111", expiry: "12/29", cvv: "123" });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("keeps the button disabled when the cvv is shorter than 3 chars", async () => {
    const user = userEvent.setup();
    render(<CardForm amount={100} />);
    await fillCard(user, { number: "411111111111", expiry: "12/29", cvv: "12" });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("ignores spaces in the card number when validating length", async () => {
    const user = userEvent.setup();
    render(<CardForm amount={100} />);
    // "4111 1111 1111" strips to 12 digits => valid
    await fillCard(user, { number: "4111 1111 1111", expiry: "12/29", cvv: "123" });
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("calls onPaymentComplete after a successful pay", async () => {
    const user = userEvent.setup();
    const onPaymentComplete = vi.fn();
    render(<CardForm amount={100} onPaymentComplete={onPaymentComplete} />);
    await fillCard(user, { number: "411111111111", expiry: "12/29", cvv: "123" });
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(onPaymentComplete).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it("falls back to a demo alert when no onPaymentComplete is provided", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<CardForm amount={100} />);
    await fillCard(user, { number: "411111111111", expiry: "12/29", cvv: "123" });
    await user.click(screen.getByRole("button"));
    await waitFor(
      () => expect(alertSpy).toHaveBeenCalledWith("Mock: Card payment successful (demo)."),
      { timeout: 2500 }
    );
  });

  it("shows a processing state and disables the button when the processing prop is set", () => {
    render(<CardForm amount={100} processing />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Processing…");
    expect(button).toBeDisabled();
  });
});
