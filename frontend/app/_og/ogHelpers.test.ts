import { describe, it, expect } from "vitest";
import { isPublicHttpUrl, priceChip, formatDateRange } from "./ogHelpers";

describe("isPublicHttpUrl (SSRF guard)", () => {
  it("allows public http(s) URLs", () => {
    expect(isPublicHttpUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isPublicHttpUrl("http://images.unsplash.com/x?w=800")).toBe(true);
  });

  it("rejects internal / private / metadata targets", () => {
    for (const u of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8080/x",
      "http://127.0.0.1/x",
      "http://10.0.0.5/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://172.31.255.255/x",
      "http://0.0.0.0/x",
      "http://svc.internal/x",
      "http://db.local/x",
      "http://[::1]/x",
    ]) {
      expect(isPublicHttpUrl(u), u).toBe(false);
    }
  });

  it("rejects non-http schemes, data URIs, relative paths, and junk", () => {
    expect(isPublicHttpUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isPublicHttpUrl("/uploads/x.png")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("ftp://host/x")).toBe(false);
    expect(isPublicHttpUrl("")).toBe(false);
    expect(isPublicHttpUrl(null)).toBe(false);
    expect(isPublicHttpUrl("not a url")).toBe(false);
  });

  it("allows public IPs adjacent to private ranges", () => {
    expect(isPublicHttpUrl("http://11.0.0.1/x")).toBe(true); // 11/8 is public
    expect(isPublicHttpUrl("http://172.15.0.1/x")).toBe(true); // just below 172.16
    expect(isPublicHttpUrl("http://172.32.0.1/x")).toBe(true); // just above 172.31
  });
});

describe("priceChip (SEO-08/03) floors the 'from' price", () => {
  it("floors fractional rupees so it never overstates", () => {
    expect(priceChip([{ price: 19950 }])).toBe("from ₹199"); // ₹199.50 -> 199, not 200
    expect(priceChip([{ price: 20000 }, { price: 50000 }])).toBe("from ₹200");
  });
  it("returns Free for a 0 price and null when there are no tickets", () => {
    expect(priceChip([{ price: 0 }])).toBe("Free");
    expect(priceChip([])).toBeNull();
    expect(priceChip(undefined)).toBeNull();
  });
});

describe("formatDateRange (UTC)", () => {
  it("formats a single date in UTC (no tz drift)", () => {
    expect(formatDateRange("2026-09-01T00:00:00.000Z")).toBe("Sep 1, 2026");
  });
  it("omits a null start and collapses same-day ranges", () => {
    expect(formatDateRange(null)).toBeNull();
    expect(formatDateRange("2026-09-01T10:00:00Z", "2026-09-01T22:00:00Z")).toBe("Sep 1, 2026");
  });
});
