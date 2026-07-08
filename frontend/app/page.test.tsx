import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

// SEO-06: the homepage is now an async Server Component that fetches the Trending
// + Upcoming rails. Mock the server fetch so these unit tests stay offline; the
// rails render their empty state, and the static hero/features are unaffected.
vi.mock("@/lib/serverApi", () => ({
  serverFetch: vi.fn(async () => ({ status: 0, data: null, body: null })),
  siteUrl: (p = "") => `http://localhost:3000${p}`,
}));

describe("Landing page (honesty)", () => {
  it("renders core feature headings", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { name: /create events/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sell tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /manage attendees/i })).toBeInTheDocument();
  });

  it("does not advertise unbuilt features (promo codes, check-in tools, email notifications)", async () => {
    render(await Home());
    expect(screen.queryByText(/promo codes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email notifications/i)).not.toBeInTheDocument();
  });

  it("advertises the CSV attendee export that actually exists", async () => {
    render(await Home());
    expect(screen.getByText(/export your attendee list to csv/i)).toBeInTheDocument();
  });

  it("does not show the fabricated '3000+ organizers' badge", async () => {
    render(await Home());
    expect(screen.queryByText(/3000\+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/trusted by/i)).not.toBeInTheDocument();
  });

  it("renders the Trending and Upcoming rails (empty state when no data)", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { name: /trending now/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /upcoming/i })).toBeInTheDocument();
  });
});
