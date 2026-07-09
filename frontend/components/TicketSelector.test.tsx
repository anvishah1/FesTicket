import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TicketSelector from "@/components/TicketSelector";

// price is INTEGER PAISE (PAY-03): 50000 paise = ₹500.00.
const ticket = {
  id: "1",
  name: "General",
  price: 50000,
  description: "Standard entry",
  available: 5,
};

describe("TicketSelector", () => {
  it("renders name, availability, description and price", () => {
    render(<TicketSelector ticket={ticket} value={0} onChange={() => {}} />);
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("(5 available)")).toBeInTheDocument();
    expect(screen.getByText("Standard entry")).toBeInTheDocument();
    expect(screen.getByText("₹500.00")).toBeInTheDocument();
  });

  it("increments up to availability when + is clicked", async () => {
    const onChange = vi.fn();
    render(<TicketSelector ticket={ticket} value={1} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Increase General"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("disables the increase button at availability (FE-15)", () => {
    render(<TicketSelector ticket={ticket} value={5} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Increase General")).toBeDisabled();
  });

  it("disables the decrease button at zero (FE-15)", () => {
    render(<TicketSelector ticket={ticket} value={0} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Decrease General")).toBeDisabled();
  });

  it("updates from direct numeric input", async () => {
    const onChange = vi.fn();
    render(<TicketSelector ticket={ticket} value={0} onChange={onChange} />);
    const input = screen.getByLabelText("General quantity");
    await userEvent.type(input, "3");
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("uses a numeric input mode and guards NaN + clamps (FE-15)", async () => {
    const onChange = vi.fn();
    render(<TicketSelector ticket={ticket} value={2} onChange={onChange} />);
    const input = screen.getByLabelText("General quantity");
    expect(input).toHaveAttribute("inputMode", "numeric");
    // Clearing to empty -> NaN -> 0 (no NaN leaks to the parent).
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("announces the quantity + line total via an aria-live region (FE-15)", () => {
    render(<TicketSelector ticket={ticket} value={2} onChange={vi.fn()} />);
    const region = screen.getByTestId("qty-announce");
    expect(region).toHaveAttribute("aria-live", "polite");
    // 2 × ₹500.00 = ₹1,000.00
    expect(region).toHaveTextContent("2 tickets, ₹1,000.00");
  });

  describe("sold-out waitlist (PAY-08)", () => {
    const soldOut = { ...ticket, available: 0 };

    it("shows 'Sold out' and hides the stepper when available is 0", () => {
      render(<TicketSelector ticket={soldOut} value={0} onChange={() => {}} onJoinWaitlist={vi.fn()} />);
      expect(screen.getByText("Sold out")).toBeInTheDocument();
      expect(screen.queryByLabelText("Increase General")).not.toBeInTheDocument();
      expect(screen.getByTestId("join-waitlist")).toBeInTheDocument();
    });

    it("captures email and calls onJoinWaitlist, then shows a confirmation", async () => {
      const onJoinWaitlist = vi.fn(async () => ({ ok: true, message: "You're on the waitlist" }));
      render(<TicketSelector ticket={soldOut} value={0} onChange={() => {}} onJoinWaitlist={onJoinWaitlist} />);
      await userEvent.click(screen.getByTestId("join-waitlist"));
      await userEvent.type(screen.getByLabelText("Waitlist email"), "w@x.com");
      await userEvent.click(screen.getByRole("button", { name: /join waitlist/i }));
      expect(onJoinWaitlist).toHaveBeenCalledWith({ ticketTypeId: "1", email: "w@x.com", name: "" });
      expect(await screen.findByTestId("waitlist-joined")).toHaveTextContent(/waitlist/i);
    });

    it("does not offer a waitlist when onJoinWaitlist is not provided", () => {
      render(<TicketSelector ticket={soldOut} value={0} onChange={() => {}} />);
      expect(screen.getByText("Sold out")).toBeInTheDocument();
      expect(screen.queryByTestId("join-waitlist")).not.toBeInTheDocument();
    });
  });
});
