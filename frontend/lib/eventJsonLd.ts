// frontend/lib/eventJsonLd.ts
//
// SEO-02: build a schema.org/Event JSON-LD object for the event detail page so
// Google can render event rich results. Money is INTEGER PAISE — schema.org
// prices are in the currency's main unit (rupees). The host email is NEVER
// included (organizer is the fest name, falling back to the host name).

/* eslint-disable @typescript-eslint/no-explicit-any */

function absoluteImage(img?: string | null): string | undefined {
  // Only an absolute http(s) URL is a valid schema.org image; drop data:/relative.
  return img && /^https?:\/\//.test(img) ? img : undefined;
}

// Serialize a JSON-LD object for safe embedding in an inline
// <script type="application/ld+json"> tag. JSON.stringify does NOT escape "<",
// so a host-controlled field containing "</script>" (event name, venue, etc.)
// would break out of the script element and enable stored XSS. Escape the three
// HTML-significant characters to their \u00XX JSON forms — still valid JSON-LD
// (the JSON parser decodes them back), but the HTML parser never sees a raw
// "<"/">"/"&", so the script element cannot be terminated early.
export function serializeJsonLd(obj: Record<string, any>): string {
  return JSON.stringify(obj).replace(/[<>&]/g, (c) =>
    "\\u00" + c.charCodeAt(0).toString(16).padStart(2, "0")
  );
}

export function buildEventJsonLd(e: any, canonical: string): Record<string, any> {
  const tickets: any[] = Array.isArray(e?.ticketTypes) ? e.ticketTypes : [];
  const prices = tickets.map((t) => t?.price).filter((p) => typeof p === "number");
  const lowPricePaise = prices.length ? Math.min(...prices) : undefined;
  const anyAvailable = tickets.some((t) => (t?.sold ?? 0) < (t?.quantity ?? 0));

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e?.name,
    url: canonical,
    eventStatus:
      e?.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
  };

  // Omit null dates/images rather than emit invalid values.
  if (e?.startDate) jsonLd.startDate = new Date(e.startDate).toISOString();
  if (e?.endDate) jsonLd.endDate = new Date(e.endDate).toISOString();
  const image = absoluteImage(e?.image);
  if (image) jsonLd.image = [image];
  const description = (e?.shortDescription || e?.description || "").toString().replace(/\s+/g, " ").trim();
  if (description) jsonLd.description = description.slice(0, 500);

  // Organizer — fest name, else host NAME (never the host email).
  const organizerName = e?.fest?.name || e?.host?.name;
  if (organizerName) jsonLd.organizer = { "@type": "Organization", name: organizerName };

  // Attendance mode + location.
  if (e?.isOnline) {
    jsonLd.eventAttendanceMode = "https://schema.org/OnlineEventAttendanceMode";
    jsonLd.location = { "@type": "VirtualLocation", url: e?.onlineLink || canonical };
  } else if (e?.venue || e?.venueAddress) {
    jsonLd.eventAttendanceMode = "https://schema.org/OfflineEventAttendanceMode";
    jsonLd.location = {
      "@type": "Place",
      name: e?.venue || e?.venueAddress,
      address: e?.venueAddress || e?.venue,
    };
  }

  // Offers (free events with price 0 are valid). Paise -> rupees.
  if (lowPricePaise != null) {
    jsonLd.offers = {
      "@type": "AggregateOffer",
      lowPrice: (lowPricePaise / 100).toFixed(2),
      priceCurrency: "INR",
      availability: anyAvailable ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      url: canonical,
      ...(e?.createdAt ? { validFrom: new Date(e.createdAt).toISOString() } : {}),
    };
  }

  return jsonLd;
}
