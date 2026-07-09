import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ContactPage from "./page";

describe("ContactPage", () => {
  it("renders the contact heading and support email link", () => {
    render(<ContactPage />);
    expect(screen.getByRole("heading", { level: 1, name: /contact us/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@FesTicket.events" })).toHaveAttribute(
      "href",
      "mailto:support@FesTicket.events"
    );
  });
});
