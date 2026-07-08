import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// SEO-01: the interactivity now lives in the client island; the page.tsx server
// component is exercised by the build/live checks, not jsdom.
import EventDetailClient from "./EventDetailClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
// Avoid pulling in react-leaflet in jsdom; the map is not under test.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Nominatim geocode mock (event data now comes from the initialEvent prop).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installGeocode(geoResults: any[] = [{ lat: "12.97", lon: "77.59" }]) {
  const nominatim = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = vi.fn((url: any) => {
    if (typeof url === "string" && url.includes("nominatim")) {
      nominatim();
      return Promise.resolve({ ok: true, json: async () => geoResults });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: makeEvent() }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { nominatim };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderIsland = (event: any) => render(<EventDetailClient eventId="1" initialEvent={event} />);

beforeEach(() => {
  installGeocode();
  window.localStorage.clear();
});

describe("EventDetailClient discount badge", () => {
  it("shows a discount badge when discount > 0", async () => {
    renderIsland(makeEvent({ discount: 30 }));
    await screen.findByText("My Event");
    expect(screen.getByTestId("discount-badge")).toHaveTextContent("30% OFF");
  });

  it("shows no badge when discount is 0", async () => {
    renderIsland(makeEvent());
    await screen.findByText("My Event");
    expect(screen.queryByTestId("discount-badge")).not.toBeInTheDocument();
  });
});

describe("EventDetailClient booking CTA", () => {
  it("enables 'Book tickets' for a bookable event", async () => {
    renderIsland(makeEvent());
    await screen.findByText("My Event");
    expect(screen.getByRole("button", { name: "Book tickets" })).toBeEnabled();
  });

  it("disables the CTA and shows 'Sold out' when every ticket is sold out", async () => {
    renderIsland(makeEvent({ ticketTypes: [{ id: 1, name: "General", price: 500, quantity: 5, sold: 5 }] }));
    await screen.findByText("My Event");
    expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
  });

  it("disables the CTA and shows 'Event ended' for a PAST event", async () => {
    renderIsland(makeEvent({ effectiveStatus: "PAST" }));
    await screen.findByText("My Event");
    expect(screen.getByRole("button", { name: "Event ended" })).toBeDisabled();
  });

  it("disables the CTA and shows 'Cancelled' for a cancelled event", async () => {
    renderIsland(makeEvent({ status: "CANCELLED" }));
    await screen.findByText("My Event");
    expect(screen.getByRole("button", { name: "Cancelled" })).toBeDisabled();
  });
});

describe("EventDetailClient geocode cache", () => {
  it("does not re-hit Nominatim on a second view of the same venue", async () => {
    const { nominatim } = installGeocode();

    const first = renderIsland(makeEvent({ venue: "Main Arena" }));
    await screen.findByText("My Event");
    await waitFor(() => expect(window.localStorage.getItem("geocode:Main Arena")).toBeTruthy());
    expect(nominatim).toHaveBeenCalledTimes(1);

    first.unmount();

    // Second mount: the venue geocode is served from cache, not Nominatim.
    renderIsland(makeEvent({ venue: "Main Arena" }));
    await screen.findByText("My Event");
    await waitFor(() => expect(window.localStorage.getItem("geocode:Main Arena")).toBeTruthy());
    expect(nominatim).toHaveBeenCalledTimes(1);
  });
});
