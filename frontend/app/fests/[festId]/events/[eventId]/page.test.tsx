import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import FestEventRedirectPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ festId: "1", eventId: "42" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/fests/1/events/42",
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

beforeEach(() => {
  replace.mockClear();
});

describe("Fest event route (redirect, no fabricated data)", () => {
  it("redirects to the canonical /events/[id] page", () => {
    render(<FestEventRedirectPage />);
    expect(replace).toHaveBeenCalledWith("/events/42");
  });

  it("does not render any hardcoded sample event data", () => {
    render(<FestEventRedirectPage />);
    // Old fabricated content must be gone.
    expect(screen.queryByText(/Proshow Day 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Book Now/i)).not.toBeInTheDocument();
  });
});
