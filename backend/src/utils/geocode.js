// backend/src/utils/geocode.js
//
// FE-06: best-effort server-side geocoding via OpenStreetMap Nominatim so a
// venue's lat/lng is resolved ONCE when an organizer saves it, instead of every
// viewer hitting Nominatim on page load. Nominatim's usage policy requires a
// descriptive User-Agent and at most ~1 request/second, so we throttle globally
// and run fire-and-forget (mirroring the non-blocking email util) — a slow or
// failed geocode never affects event-save latency or success.

import prisma from "../prisma.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "FesTicket/1.0 (college-fest event ticketing)";
const MIN_INTERVAL_MS = 1100; // >= 1 req/s per Nominatim policy
const TIMEOUT_MS = 5000;

let lastCallAt = 0;
// Serialize slot reservation: each throttle() chains off the previous one so
// concurrent fire-and-forget calls queue ~MIN_INTERVAL_MS apart instead of all
// reading the same stale `lastCallAt` and firing at once.
let throttleChain = Promise.resolve();

function throttle() {
  const run = throttleChain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  // Keep the chain alive even if a downstream awaiter rejects.
  throttleChain = run.catch(() => {});
  return run;
}

// Resolve a free-text address to { latitude, longitude }, or null on any failure.
export async function geocodeAddress(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data) || !data[0]) return null;
    const latitude = parseFloat(data[0].lat);
    const longitude = parseFloat(data[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget: geocode an event's venue and persist lat/lng/geocodedAt. Never
// throws and is never awaited by the request path. Skipped entirely under
// NODE_ENV=test so the suite makes no network calls.
export function geocodeEventInBackground(eventId, query, log) {
  if (process.env.NODE_ENV === "test") return;
  const q = String(query || "").trim();
  if (!eventId || !q) return;
  geocodeAddress(q)
    .then(async (coords) => {
      if (!coords) return;
      await prisma.event.update({
        where: { id: eventId },
        data: { latitude: coords.latitude, longitude: coords.longitude, geocodedAt: new Date() },
      });
      log?.info?.({ eventId, ...coords }, "FE-06 geocoded event venue");
    })
    .catch((err) => log?.warn?.({ err, eventId }, "FE-06 geocode failed"));
}

// Build the geocode query from a venue + address (address is more specific).
export function venueQuery(venue, venueAddress) {
  return [venueAddress, venue].filter((s) => s && String(s).trim()).join(", ");
}
