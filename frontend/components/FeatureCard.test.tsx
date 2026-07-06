import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FeatureCard from "@/components/FeatureCard";

describe("FeatureCard", () => {
  it("renders the title as a heading", () => {
    render(<FeatureCard title="Fast checkout" body="Buy tickets in seconds" />);
    const heading = screen.getByRole("heading", { name: "Fast checkout" });
    expect(heading).toBeInTheDocument();
  });

  it("renders the body text", () => {
    render(<FeatureCard title="Fast checkout" body="Buy tickets in seconds" />);
    expect(screen.getByText("Buy tickets in seconds")).toBeInTheDocument();
  });

  it("renders the checkmark icon placeholder", () => {
    render(<FeatureCard title="A" body="B" />);
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("reflects updated props on re-render", () => {
    const { rerender } = render(<FeatureCard title="First" body="one" />);
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    rerender(<FeatureCard title="Second" body="two" />);
    expect(screen.getByRole("heading", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });
});
