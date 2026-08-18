import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "./page";

describe("PrivacyPage", () => {
  it("renders the privacy heading", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: /privacy/i })).toBeInTheDocument();
  });

  it("does not duplicate the brand suffix in its own title (the root layout template already appends it)", () => {
    expect(metadata.title).toBe("Privacy");
  });
});
