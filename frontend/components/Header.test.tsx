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

  it("renders the tiqr brand linked to home", () => {
    render(<Header />);
    expect(screen.getByText("tiqr")).toBeInTheDocument();
    expect(screen.getByText("tiqr").closest("a")).toHaveAttribute("href", "/");
  });

  it("renders the Discover, Fests and About nav links", () => {
    render(<Header />);
    expect(screen.getAllByRole("link", { name: "Discover" })[0]).toHaveAttribute("href", "/fests");
    expect(screen.getAllByRole("link", { name: "Fests" })[0]).toHaveAttribute("href", "/fests");
    expect(screen.getAllByRole("link", { name: "About" })[0]).toHaveAttribute("href", "/about");
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
