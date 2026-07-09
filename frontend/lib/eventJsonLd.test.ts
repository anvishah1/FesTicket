import { describe, it, expect } from "vitest";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/eventJsonLd";

const CANON = "https://FesTicket.test/events/5";

const base = {
  id: 5,
  name: "Neon Night",
  status: "PUBLISHED",
  startDate: "2026-09-01T18:00:00.000Z",
  endDate: null,
  image: "https://cdn.test/poster.jpg",
  shortDescription: "Live music and lights.",
  createdAt: "2026-01-01T00:00:00.000Z",
  fest: { name: "Spring Fest" },
  host: { name: "Host Person", email: "host@x.com" },
  venue: "Grand Arena",
  venueAddress: "1 Fest Ave",
  isOnline: false,
  onlineLink: null,
  ticketTypes: [
    { price: 50000, quantity: 100, sold: 3 },
    { price: 20000, quantity: 50, sold: 10 },
  ],
};

describe("buildEventJsonLd (SEO-02)", () => {
  it("emits a valid paid offline Event with the cheapest offer + InStock", () => {
    const ld = buildEventJsonLd(base, CANON);
    expect(ld["@type"]).toBe("Event");
    expect(ld.name).toBe("Neon Night");
    expect(ld.url).toBe(CANON);
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ld.startDate).toBe("2026-09-01T18:00:00.000Z");
    expect(ld.image).toEqual(["https://cdn.test/poster.jpg"]);
    expect(ld.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(ld.location).toMatchObject({ "@type": "Place", name: "Grand Arena", address: "1 Fest Ave" });
    // lowPrice is the cheapest ticket (paise -> rupees) and availability is InStock.
    expect(ld.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "200.00",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: CANON,
      validFrom: "2026-01-01T00:00:00.000Z",
    });
    // Organizer is the fest name.
    expect(ld.organizer).toEqual({ "@type": "Organization", name: "Spring Fest" });
  });

  it("NEVER includes the host email anywhere in the payload", () => {
    const ld = buildEventJsonLd(base, CANON);
    expect(JSON.stringify(ld)).not.toContain("host@x.com");
  });

  it("uses VirtualLocation + OnlineEventAttendanceMode for an online event", () => {
    const ld = buildEventJsonLd({ ...base, isOnline: true, onlineLink: "https://meet.test/x" }, CANON);
    expect(ld.eventAttendanceMode).toBe("https://schema.org/OnlineEventAttendanceMode");
    expect(ld.location).toEqual({ "@type": "VirtualLocation", url: "https://meet.test/x" });
  });

  it("flips availability to SoldOut when every ticket is sold", () => {
    const ld = buildEventJsonLd(
      { ...base, ticketTypes: [{ price: 50000, quantity: 5, sold: 5 }] },
      CANON
    );
    expect(ld.offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("serializes a CANCELLED event as EventCancelled", () => {
    const ld = buildEventJsonLd({ ...base, status: "CANCELLED" }, CANON);
    expect(ld.eventStatus).toBe("https://schema.org/EventCancelled");
  });

  it("omits null dates and a data:/relative image", () => {
    const ld = buildEventJsonLd({ ...base, startDate: null, endDate: null, image: "/uploads/x.png" }, CANON);
    expect(ld.startDate).toBeUndefined();
    expect(ld.endDate).toBeUndefined();
    expect(ld.image).toBeUndefined();
  });

  it("treats a free event (price 0) as a valid InStock offer", () => {
    const ld = buildEventJsonLd({ ...base, ticketTypes: [{ price: 0, quantity: 100, sold: 0 }] }, CANON);
    expect(ld.offers.lowPrice).toBe("0.00");
    expect(ld.offers.availability).toBe("https://schema.org/InStock");
  });
});

describe("serializeJsonLd (XSS-safe embedding)", () => {
  it("escapes </script> so a hostile event name cannot break out of the tag", () => {
    const evil = "</script><script>alert(document.cookie)</script>";
    const out = serializeJsonLd(buildEventJsonLd({ ...base, name: evil }, CANON));
    // No raw HTML-significant chars survive.
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c"); // escaped "<"
    // Still valid JSON that decodes back to the original text (valid JSON-LD).
    expect(JSON.parse(out).name).toBe(evil);
  });

  it("escapes ampersands too", () => {
    const out = serializeJsonLd({ name: "Rock & Roll" });
    expect(out).not.toContain("&");
    expect(out).toContain("\\u0026");
    expect(JSON.parse(out).name).toBe("Rock & Roll");
  });
});
