import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Landing page (honesty)", () => {
  it("renders core feature headings", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /create events/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sell tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /manage attendees/i })).toBeInTheDocument();
  });

  it("does not advertise unbuilt features (promo codes, check-in tools, email notifications)", () => {
    render(<Home />);
    expect(screen.queryByText(/promo codes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email notifications/i)).not.toBeInTheDocument();
  });

  it("advertises the CSV attendee export that actually exists", () => {
    render(<Home />);
    expect(screen.getByText(/export your attendee list to csv/i)).toBeInTheDocument();
  });
});
