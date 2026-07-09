import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle, { THEME_STORAGE_KEY } from "@/components/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders a light-mode toggle by default (offers to switch to dark)", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /switch to dark theme/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking applies the dark theme to <html> and persists the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    // The control now offers the reverse action.
    expect(
      screen.getByRole("button", { name: /switch to light theme/i })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles back to light on a second click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(
      screen.getByRole("button", { name: /switch to dark theme/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects an already-stored dark choice on mount", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /switch to light theme/i })
    ).toHaveAttribute("aria-pressed", "true");
  });
});
