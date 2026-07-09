import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

describe("Footer", () => {
  it("renders the brand with the current year", () => {
    render(<Footer />);
    const year = String(new Date().getFullYear());
    expect(
      screen.getByText((content) => content.includes("FesTicket") && content.includes(year))
    ).toBeInTheDocument();
  });

  it("renders the About link", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  });

  it("renders the Privacy link", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("renders the Terms link", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });

  it("renders the Contact link", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  });

  it("wires the Support link to the support email", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "mailto:support@FesTicket.events"
    );
  });
});
