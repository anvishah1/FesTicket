import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TermsPage, { metadata } from "./page";

describe("TermsPage", () => {
  it("renders the terms heading", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: /terms of use/i })).toBeInTheDocument();
  });

  it("does not duplicate the brand suffix in its own title (the root layout template already appends it)", () => {
    expect(metadata.title).toBe("Terms");
  });
});
