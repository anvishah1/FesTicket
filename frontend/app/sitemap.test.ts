import { describe, it, expect, vi, beforeEach } from "vitest";

// SEO-04: sitemap.ts and robots.ts are pure server functions — test them directly
// with a mocked serverApi (deterministic origin + a stubbed backend feed).
vi.mock("@/lib/serverApi", () => ({
  siteUrl: (p = "") => `https://tiqr.test${p}`,
  serverFetch: vi.fn(),
}));

import sitemap from "./sitemap";
import robots from "./robots";
import { serverFetch } from "@/lib/serverApi";

const sf = serverFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => sf.mockReset());

describe("sitemap (SEO-04)", () => {
  it("lists static + fest + event URLs with lastModified from updatedAt, no private routes", async () => {
    sf.mockImplementation(async (path: string) => {
      if (path === "/api/events/sitemap")
        return { status: 200, data: [{ id: 10, updatedAt: "2026-05-01T00:00:00.000Z" }], body: null };
      if (path === "/api/fests/sitemap")
        return { status: 200, data: [{ id: 3, updatedAt: "2026-04-01T00:00:00.000Z" }], body: null };
      return { status: 0, data: null, body: null };
    });

    const map = await sitemap();
    const urls = map.map((e) => e.url);

    expect(urls).toContain("https://tiqr.test/");
    expect(urls).toContain("https://tiqr.test/fests");
    expect(urls).toContain("https://tiqr.test/fests/3/events");
    expect(urls).toContain("https://tiqr.test/events/10");

    const ev = map.find((e) => e.url === "https://tiqr.test/events/10");
    expect(ev?.lastModified).toEqual(new Date("2026-05-01T00:00:00.000Z"));

    // No admin/host/booking/payment/auth URL ever appears.
    expect(urls.some((u) => /\/(admin|host|signin|signup|forgot|reset|booking|payment)/.test(u))).toBe(false);
  });

  it("degrades to just the static routes when the backend is unreachable", async () => {
    sf.mockResolvedValue({ status: 0, data: null, body: null });
    const map = await sitemap();
    expect(map.map((e) => e.url)).toEqual([
      "https://tiqr.test/",
      "https://tiqr.test/fests",
      "https://tiqr.test/events",
    ]);
  });

  it("omits lastModified for an unparseable updatedAt", async () => {
    sf.mockImplementation(async (path: string) =>
      path === "/api/events/sitemap"
        ? { status: 200, data: [{ id: 1, updatedAt: "not-a-date" }], body: null }
        : { status: 200, data: [], body: null }
    );
    const map = await sitemap();
    expect(map.find((e) => e.url === "https://tiqr.test/events/1")?.lastModified).toBeUndefined();
  });
});

describe("robots (SEO-04)", () => {
  it("allows / and disallows the operational routes, and references the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toEqual(
      expect.arrayContaining([
        "/admin",
        "/host",
        "/signin",
        "/signup",
        "/forgot",
        "/reset",
        "/bookings",
        "/booking-confirmation",
        "/events/*/booking",
        "/events/*/payment",
      ])
    );
    expect(r.sitemap).toBe("https://tiqr.test/sitemap.xml");
  });
});
