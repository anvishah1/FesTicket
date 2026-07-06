import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import Toaster from "./Toaster";
import { showToast } from "@/lib/toast";

afterEach(cleanup);

describe("Toaster + showToast", () => {
  it("renders a toast in an aria-live region when showToast is called", () => {
    render(<Toaster />);

    // Nothing rendered until a toast is emitted.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      showToast("Booking confirmed", "success");
    });

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
  });

  it("dismisses a toast when its close button is clicked", () => {
    render(<Toaster />);

    act(() => {
      showToast("Dismiss me", "error");
    });
    expect(screen.getByText("Dismiss me")).toBeInTheDocument();

    act(() => {
      screen.getByLabelText("Dismiss notification").click();
    });
    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });
});
