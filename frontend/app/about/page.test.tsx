import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "./page";

describe("AboutPage", () => {
  it("renders a heading and the support email", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: /about tiqr/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@tiqr.events" })).toHaveAttribute(
      "href",
      "mailto:support@tiqr.events"
    );
  });
});
