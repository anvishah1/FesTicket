import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";
import EventDetailSkeleton from "@/components/skeletons/EventDetailSkeleton";

describe("skeletons (FE-05)", () => {
  it("CardGridSkeleton renders `count` placeholder cards and is decorative", () => {
    const { container } = render(<CardGridSkeleton count={4} />);
    const root = screen.getByTestId("card-grid-skeleton");
    expect(root).toHaveAttribute("aria-hidden", "true");
    // Mirrors the real grid layout (no content shift).
    expect(root.className).toMatch(/grid-cols-2/);
    // 4 top-level card placeholders.
    expect(root.children).toHaveLength(4);
    // Uses the pulse animation (disabled under prefers-reduced-motion via globals.css).
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("EventDetailSkeleton mirrors the 2fr/1fr detail layout and is decorative", () => {
    render(<EventDetailSkeleton />);
    const root = screen.getByTestId("event-detail-skeleton");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toMatch(/lg:grid-cols-\[2fr_1fr\]/);
  });
});
