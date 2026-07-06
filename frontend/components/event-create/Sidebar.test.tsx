import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "@/components/event-create/Sidebar";

describe("Sidebar", () => {
  it("renders every step label", () => {
    render(<Sidebar current="basics" onChange={() => {}} />);
    expect(screen.getByText("Event Basics")).toBeInTheDocument();
    expect(screen.getByText("Describe Your Event")).toBeInTheDocument();
    expect(screen.getByText("Event Location")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Registration Form")).toBeInTheDocument();
  });

  it("marks the current step with the active dot", () => {
    render(<Sidebar current="basics" onChange={() => {}} />);
    // The active step shows a single ● indicator.
    expect(screen.getByText("●")).toBeInTheDocument();
  });

  it("exposes the active step via aria-current='step'", () => {
    render(<Sidebar current="tickets" onChange={() => {}} />);
    const activeBtn = screen.getByText("Tickets").closest("button")!;
    expect(activeBtn).toHaveAttribute("aria-current", "step");
    // Non-active steps must not carry aria-current.
    const otherBtn = screen.getByText("Event Basics").closest("button")!;
    expect(otherBtn).not.toHaveAttribute("aria-current");
  });

  it("calls onChange with the clicked step id", async () => {
    const onChange = vi.fn();
    render(<Sidebar current="basics" onChange={onChange} />);
    await userEvent.click(screen.getByText("Tickets"));
    expect(onChange).toHaveBeenCalledWith("tickets");
  });

  it("calls onChange for each step with its own id", async () => {
    const onChange = vi.fn();
    render(<Sidebar current="basics" onChange={onChange} />);
    await userEvent.click(screen.getByText("Describe Your Event"));
    await userEvent.click(screen.getByText("Event Location"));
    await userEvent.click(screen.getByText("Registration Form"));
    expect(onChange).toHaveBeenNthCalledWith(1, "describe");
    expect(onChange).toHaveBeenNthCalledWith(2, "location");
    expect(onChange).toHaveBeenNthCalledWith(3, "form");
  });

  it("numbers upcoming steps and check-marks completed ones", () => {
    // current = tickets (index 3): basics/describe/location are completed,
    // tickets is active (shows number 4), form is upcoming (shows number 5).
    render(<Sidebar current="tickets" onChange={() => {}} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    // Completed steps replace their number with a check icon.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("disables a gated step and ignores clicks on it (zero-ticket/skip guard)", async () => {
    const onChange = vi.fn();
    // Only allow the active step; everything else is locked.
    render(
      <Sidebar
        current="basics"
        onChange={onChange}
        isStepEnabled={(s) => s === "basics"}
      />
    );
    const formBtn = screen.getByText("Registration Form").closest("button")!;
    // Locked steps convey state via aria-disabled (not the native `disabled`
    // attribute) so they stay keyboard-focusable while still ignoring activation.
    expect(formBtn).toHaveAttribute("aria-disabled", "true");
    expect(formBtn).not.toBeDisabled();
    await userEvent.click(formBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still navigates to enabled steps when a gate is supplied", async () => {
    const onChange = vi.fn();
    render(
      <Sidebar
        current="basics"
        onChange={onChange}
        isStepEnabled={(s) => s === "basics" || s === "location"}
      />
    );
    await userEvent.click(screen.getByText("Event Location"));
    expect(onChange).toHaveBeenCalledWith("location");
  });
});
