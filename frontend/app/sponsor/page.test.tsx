import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SponsorPage, { metadata } from "./page";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

describe("SponsorPage", () => {
  it("renders the sponsorship form", () => {
    render(<SponsorPage />);
    expect(screen.getByRole("heading", { level: 1, name: /become a sponsor/i })).toBeInTheDocument();
  });

  // The page used to be a "use client" component with no metadata export at
  // all, so it fell through to the root layout's generic site-wide title.
  it("has its own page-specific title, not the generic site default", () => {
    expect(metadata.title).toBe("Sponsor an Event");
  });
});
