import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentButton from "@/components/PaymentButton";

afterEach(() => {
  vi.useRealTimers();
});

describe("PaymentButton", () => {
  it("renders the amount in the label and accessible name", () => {
    render(<PaymentButton amount={120000} />);
    const btn = screen.getByRole("button", { name: "Pay 1200 rupees" });
    expect(btn).toHaveTextContent("Pay ₹1,200.00");
    expect(btn).toBeEnabled();
  });

  it("is disabled and carries the disabled styling when disabled prop is set", async () => {
    const onSuccess = vi.fn();
    render(<PaymentButton amount={50000} disabled onSuccess={onSuccess} />);
    const btn = screen.getByRole("button", { name: "Pay 500 rupees" });
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("bg-[var(--surface-slate-200)]");
    await userEvent.click(btn);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a processing state then calls onSuccess after the mock delay", async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    render(<PaymentButton amount={99900} onSuccess={onSuccess} />);
    const btn = screen.getByRole("button", { name: "Pay 999 rupees" });

    fireEvent.click(btn);

    // enters loading state immediately
    expect(btn).toHaveTextContent("Processing…");
    expect(btn).toBeDisabled();
    expect(onSuccess).not.toHaveBeenCalled();

    // advance past the 1200ms mock payment delay (flushes the awaited promise)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(btn).toHaveTextContent("Pay ₹999.00");
    expect(btn).toBeEnabled();
  });

  it("does not throw and simply resolves when onSuccess is omitted", async () => {
    vi.useFakeTimers();
    render(<PaymentButton amount={1000} />);
    const btn = screen.getByRole("button", { name: "Pay 10 rupees" });
    fireEvent.click(btn);
    expect(btn).toHaveTextContent("Processing…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(btn).toHaveTextContent("Pay ₹10.00");
  });
});
