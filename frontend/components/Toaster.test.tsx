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

  it("positions below the sticky header, not on top of it", () => {
    render(<Toaster />);
    act(() => {
      showToast("Hello", "info");
    });
    const container = screen.getByRole("status").parentElement;
    // The header is h-16 (sticky, z-40) — the toast must clear it (top-20),
    // not sit at top-4 where it used to cover the header's own controls.
    expect(container?.className).toContain("top-20");
    expect(container?.className).not.toContain("top-4 ");
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
