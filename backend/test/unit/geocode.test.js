import { describe, it, expect, vi, afterEach } from "vitest";
import { geocodeAddress, venueQuery, geocodeEventInBackground } from "../../src/utils/geocode.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("venueQuery (FE-06)", () => {
  it("joins address + venue (address first), dropping empties", () => {
    expect(venueQuery("Grand Arena", "1 Fest Ave, Mumbai")).toBe("1 Fest Ave, Mumbai, Grand Arena");
    expect(venueQuery("Grand Arena", null)).toBe("Grand Arena");
    expect(venueQuery("", "")).toBe("");
    expect(venueQuery(null, undefined)).toBe("");
  });
});

describe("geocodeAddress (FE-06)", () => {
  it("returns null for a blank query without calling the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await geocodeAddress("   ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses the first Nominatim result into { latitude, longitude }", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "18.9219", lon: "72.8347" }],
    });
    expect(await geocodeAddress("Gateway of India, Mumbai")).toEqual({ latitude: 18.9219, longitude: 72.8347 });
  });

  it("returns null on an empty result set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] });
    expect(await geocodeAddress("nowhere at all zzz")).toBeNull();
  });
});

describe("geocodeEventInBackground (FE-06)", () => {
  it("is a no-op under NODE_ENV=test (no network, no throw)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(() => geocodeEventInBackground(1, "Somewhere", { info: vi.fn(), warn: vi.fn() })).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
