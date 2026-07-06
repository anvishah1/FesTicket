import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EventDetailsPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
// Avoid pulling in react-leaflet in jsdom; the map is not under test.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

function makeEvent(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: "My Event",
    status: "PUBLISHED",
    effectiveStatus: "UPCOMING",
    discount: 0,
    venue: null,
    venueAddress: null,
    ticketTypes: [{ id: 1, name: "General", price: 500, quantity: 10, sold: 0 }],
    ...overrides,
  };
}

// URL-routing fetch mock. Returns a nominatim spy so tests can assert geocode
// caching behaviour.
function installFetch(eventData: any, geoResults: any[] = [{ lat: "12.97", lon: "77.59" }]) {
  const nominatim = vi.fn();
  globalThis.fetch = vi.fn((url: any) => {
    if (typeof url === "string" && url.includes("nominatim")) {
      nominatim();
      return Promise.resolve({ ok: true, json: async () => geoResults });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: eventData }) });
  }) as any;
  return { nominatim };
}

beforeEach(() => {
  installFetch(makeEvent());
});

describe("EventDetailsPage discount badge", () => {
  it("shows a discount badge when discount > 0", async () => {
    installFetch(makeEvent({ discount: 30 }));
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    expect(screen.getByTestId("discount-badge")).toHaveTextContent("30% OFF");
  });

  it("shows no badge when discount is 0", async () => {
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    expect(screen.queryByTestId("discount-badge")).not.toBeInTheDocument();
  });
});

describe("EventDetailsPage booking CTA", () => {
  it("enables 'Book tickets' for a bookable event", async () => {
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    const btn = screen.getByRole("button", { name: "Book tickets" });
    expect(btn).toBeEnabled();
  });

  it("disables the CTA and shows 'Sold out' when every ticket is sold out", async () => {
    installFetch(makeEvent({ ticketTypes: [{ id: 1, name: "General", price: 500, quantity: 5, sold: 5 }] }));
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    const btn = screen.getByRole("button", { name: "Sold out" });
    expect(btn).toBeDisabled();
  });

  it("disables the CTA and shows 'Event ended' for a PAST event", async () => {
    installFetch(makeEvent({ effectiveStatus: "PAST" }));
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    const btn = screen.getByRole("button", { name: "Event ended" });
    expect(btn).toBeDisabled();
  });

  it("disables the CTA and shows 'Cancelled' for a cancelled event", async () => {
    installFetch(makeEvent({ status: "CANCELLED" }));
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    const btn = screen.getByRole("button", { name: "Cancelled" });
    expect(btn).toBeDisabled();
  });
});

describe("EventDetailsPage geocode cache", () => {
  it("does not re-hit Nominatim on a second view of the same venue", async () => {
    const { nominatim } = installFetch(makeEvent({ venue: "Main Arena" }));

    const first = render(<EventDetailsPage />);
    await screen.findByText("My Event");
    // Wait for the geocode result to be persisted to the cache.
    await waitFor(() =>
      expect(window.localStorage.getItem("geocode:Main Arena")).toBeTruthy()
    );
    expect(nominatim).toHaveBeenCalledTimes(1);

    first.unmount();

    // Second mount: event refetched, but the venue geocode is served from cache.
    render(<EventDetailsPage />);
    await screen.findByText("My Event");
    await waitFor(() =>
      expect(window.localStorage.getItem("geocode:Main Arena")).toBeTruthy()
    );
    expect(nominatim).toHaveBeenCalledTimes(1);
  });
});
