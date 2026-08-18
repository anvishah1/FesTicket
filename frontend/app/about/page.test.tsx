import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage, { metadata } from "./page";

describe("AboutPage", () => {
  it("renders a heading and the support email", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: /about FesTicket/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@FesTicket.events" })).toHaveAttribute(
      "href",
      "mailto:support@FesTicket.events"
    );
  });

  // The root layout's title template already appends "| FesTicket" — a page
  // title baking in its own "· FesTicket" duplicated the brand in the tab.
  it("does not duplicate the brand suffix in its own title (the root layout template already appends it)", () => {
    expect(metadata.title).toBe("About");
  });
});
