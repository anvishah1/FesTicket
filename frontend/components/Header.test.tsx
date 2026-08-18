import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Header from "@/components/Header";
import { setAuth, clearAuth } from "@/lib/auth";

function storeUser(role = "VIEWER", name: string | null = "Ada Lovelace") {
  setAuth("access-tok", "refresh-tok", {
    id: 1,
    email: "ada@school.edu",
    name,
    role,
    profileCompleted: true,
  });
}

describe("Header", () => {
  beforeEach(() => {
    clearAuth();
  });

  it("renders a Skip to main content link targeting #main-content as an early focusable element", () => {
    render(<Header />);
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(skip).toHaveClass("skip-link");
  });

  it("renders the FesTicket brand linked to home", () => {
    render(<Header />);
    expect(screen.getByText("FesTicket")).toBeInTheDocument();
    expect(screen.getByText("FesTicket").closest("a")).toHaveAttribute("href", "/");
  });

  it("renders the Discover and About nav links (no duplicate Fests)", () => {
    render(<Header />);
    expect(screen.getAllByRole("link", { name: "Discover" })[0]).toHaveAttribute("href", "/fests");
    expect(screen.getAllByRole("link", { name: "About" })[0]).toHaveAttribute("href", "/about");
    // The duplicate "Fests" link (also -> /fests) was removed.
    expect(screen.queryByRole("link", { name: "Fests" })).not.toBeInTheDocument();
  });

  it("wires the Support control to the contact route", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/contact");
  });

  it("shows Sign In when logged out and no user menu", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });

  it("shows the user's name and a menu with Log out when logged in", () => {
    storeUser("VIEWER", "Ada Lovelace");
    render(<Header />);

    // Name is visible; Sign In is gone.
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign In" })).not.toBeInTheDocument();

    // Open the account menu.
    fireEvent.click(screen.getByRole("button", { name: /ada lovelace/i }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
  });

  it("renders the notification bell for a signed-in user with no responsive 'hidden' wrapper (mobile must reach it too)", () => {
    storeUser("VIEWER", "Ada Lovelace");
    render(<Header />);

    const bell = screen.getByTestId("notification-bell");
    expect(bell).toBeInTheDocument();
    // Previously wrapped in a `hidden sm:block` div, making it unreachable on
    // mobile viewports with no alternative entry point.
    expect(bell.closest(".hidden")).toBeNull();
  });

  it("links ADMIN users to the admin dashboard", () => {
    storeUser("ADMIN", "Prof X");
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /prof x/i }));
    expect(screen.getByRole("menuitem", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/admin/dashboard"
    );
  });

  it("links EDITOR/HOST users to the host dashboard", () => {
    storeUser("EDITOR", "Editor E");
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /editor e/i }));
    expect(screen.getByRole("menuitem", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/host/dashboard"
    );
  });

  it("does not show a Dashboard item for a plain VIEWER", () => {
    storeUser("VIEWER", "Ada Lovelace");
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /ada lovelace/i }));
    expect(screen.queryByRole("menuitem", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  // FE-14: account-menu keyboard + focus management.
  it("focuses the first menu item when the account menu opens", () => {
    storeUser("VIEWER", "Ada Lovelace");
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /ada lovelace/i }));
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("ArrowDown moves focus to the next menu item (roving)", () => {
    storeUser("VIEWER", "Ada Lovelace");
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /ada lovelace/i }));
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("Escape closes the account menu and restores focus to the trigger", () => {
    storeUser("VIEWER", "Ada Lovelace");
    render(<Header />);
    const trigger = screen.getByRole("button", { name: /ada lovelace/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("locks body scroll while the mobile sheet is open and unlocks on close", () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: /toggle navigation menu/i });
    fireEvent.click(toggle);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
    // Focus returns to the hamburger.
    expect(document.activeElement).toBe(toggle);
  });

  it("mobile hamburger toggles the nav and exposes aria-expanded", () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: /toggle navigation menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "mobile-nav");
    expect(document.getElementById("mobile-nav")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("mobile-nav")).not.toBeNull();

    // Escape closes it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("mobile-nav")).toBeNull();
  });
});
