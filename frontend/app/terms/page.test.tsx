import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TermsPage from "./page";

describe("TermsPage", () => {
  it("renders the terms heading", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: /terms of use/i })).toBeInTheDocument();
  });
});
