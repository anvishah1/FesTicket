import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Tickets, { type TicketsData } from "@/components/event-create/Tickets";
import { showToast } from "@/lib/toast";

// Tickets surfaces validation failures via showToast; mock it.
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
beforeEach(() => vi.mocked(showToast).mockClear());

describe("Tickets", () => {
  it("renders the heading and a default paid ticket row", () => {
    render(<Tickets onNext={() => {}} />);
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByDisplayValue("General Admission")).toBeInTheDocument();
    expect(screen.getByText("Ticket 1")).toBeInTheDocument();
    // Paid mode shows a price input.
    expect(screen.getByPlaceholderText("Price (₹)")).toBeInTheDocument();
    // Only one ticket, so no Remove button.
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("adds another ticket row", async () => {
    render(<Tickets onNext={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add Another Ticket Type" })
    );
    expect(screen.getByText("Ticket 2")).toBeInTheDocument();
    // With two tickets, both rows expose a Remove button.
    expect(screen.getAllByText("Remove")).toHaveLength(2);
  });

  it("removes a ticket row", async () => {
    render(<Tickets onNext={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add Another Ticket Type" })
    );
    expect(screen.getByText("Ticket 2")).toBeInTheDocument();
    await userEvent.click(screen.getAllByText("Remove")[0]);
    expect(screen.queryByText("Ticket 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("switches to free mode, replacing the price input with 'Free'", async () => {
    render(<Tickets onNext={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Free" }));
    expect(screen.queryByPlaceholderText("Price (₹)")).not.toBeInTheDocument();
    // "Free" appears twice: the active toggle button and the ticket's price cell.
    expect(screen.getAllByText("Free")).toHaveLength(2);
  });

  it("alerts and does not submit when no ticket has a name", async () => {
    const onNext = vi.fn();
    render(<Tickets onNext={onNext} />);
    await userEvent.clear(screen.getByDisplayValue("General Admission"));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(showToast).toHaveBeenCalledWith("Please add at least one ticket type", "error");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("submits paid ticket data including the entered price", async () => {
    const onNext = vi.fn();
    render(<Tickets onNext={onNext} />);
    const nameInput = screen.getByDisplayValue("General Admission");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "VIP");
    await userEvent.type(screen.getByPlaceholderText("Price (₹)"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    const payload = onNext.mock.calls[0][0] as TicketsData;
    expect(payload.isPaid).toBe(true);
    expect(payload.tickets).toHaveLength(1);
    expect(payload.tickets[0]).toMatchObject({ name: "VIP", price: 500 });
  });

  it("forces price to 0 when submitting in free mode", async () => {
    const onNext = vi.fn();
    render(<Tickets onNext={onNext} />);
    // Enter a price while paid, then switch to free before submitting.
    await userEvent.type(screen.getByPlaceholderText("Price (₹)"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Free" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    const payload = onNext.mock.calls[0][0] as TicketsData;
    expect(payload.isPaid).toBe(false);
    expect(payload.tickets[0].price).toBe(0);
  });

  it("filters out unnamed tickets on submit", async () => {
    const onNext = vi.fn();
    render(<Tickets onNext={onNext} />);
    // Add a second, unnamed ticket; only the named default should survive.
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add Another Ticket Type" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    const payload = onNext.mock.calls[0][0] as TicketsData;
    expect(payload.tickets).toHaveLength(1);
    expect(payload.tickets[0].name).toBe("General Admission");
  });

  it("prefills from initialData in free mode", () => {
    const initialData: TicketsData = {
      isPaid: false,
      tickets: [{ id: 9, name: "Early Bird", price: 0, quantity: 50, description: "" }],
    };
    render(<Tickets onNext={() => {}} initialData={initialData} />);
    expect(screen.getByDisplayValue("Early Bird")).toBeInTheDocument();
    // "Free" appears twice: the active toggle button and the ticket's price cell.
    expect(screen.getAllByText("Free")).toHaveLength(2);
  });

  it("blocks submit when a ticket quantity is blank/zero (no silent default of 100)", async () => {
    const onNext = vi.fn();
    render(<Tickets onNext={onNext} />);
    // Clear the seeded quantity of 100 -> it must NOT quietly fall back to 100.
    await userEvent.clear(screen.getByPlaceholderText("Quantity"));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(showToast).toHaveBeenCalledWith(
      'Ticket "General Admission" needs a quantity of at least 1.',
      "error"
    );
    expect(onNext).not.toHaveBeenCalled();
  });

  it("blocks submit on a negative price (defensive guard)", async () => {
    const onNext = vi.fn();
    const initialData: TicketsData = {
      isPaid: true,
      tickets: [{ id: 1, name: "VIP", price: -5, quantity: 10, description: "" }],
    };
    render(<Tickets onNext={onNext} initialData={initialData} />);
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(showToast).toHaveBeenCalledWith(
      'Ticket "VIP" has an invalid price. Price cannot be negative.',
      "error"
    );
    expect(onNext).not.toHaveBeenCalled();
  });

  it("clamps a typed negative price up to 0 on input", async () => {
    render(<Tickets onNext={() => {}} />);
    const priceInput = screen.getByPlaceholderText("Price (₹)") as HTMLInputElement;
    await userEvent.type(priceInput, "-5");
    // Negative is clamped -> field shows empty (value 0), never a negative number.
    expect(priceInput.value === "" || Number(priceInput.value) >= 0).toBe(true);
  });

  it("reports edits continuously via onChange (data-loss fix)", async () => {
    const onChange = vi.fn();
    render(<Tickets onNext={() => {}} onChange={onChange} />);
    const nameInput = screen.getByDisplayValue("General Admission");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Gold");
    const last = onChange.mock.calls.at(-1)?.[0] as TicketsData;
    expect(last.tickets[0].name).toBe("Gold");
  });

  it("labels each ticket field for screen readers", () => {
    render(<Tickets onNext={() => {}} />);
    expect(screen.getByLabelText("Ticket 1 name")).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket 1 price in rupees")).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket 1 quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket 1 description")).toBeInTheDocument();
  });

  it("gives each remove button an accessible name", async () => {
    render(<Tickets onNext={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add Another Ticket Type" })
    );
    expect(
      screen.getByRole("button", { name: "Remove ticket 1" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove ticket 2" })
    ).toBeInTheDocument();
  });

  it("submits the entered ticket description", async () => {
    const onNext = vi.fn();
    render(<Tickets onNext={onNext} />);
    const nameInput = screen.getByDisplayValue("General Admission");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "VIP");
    await userEvent.type(
      screen.getByPlaceholderText("Description (optional)"),
      "Front row seats"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    const payload = onNext.mock.calls[0][0] as TicketsData;
    expect(payload.tickets[0]).toMatchObject({
      name: "VIP",
      description: "Front row seats",
    });
  });
});
