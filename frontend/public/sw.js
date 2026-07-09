/* FesTicket service worker (TIX-08)
 *
 * Goal: a saved ticket QR still renders at the gate with no signal.
 *
 * Strategy:
 *  - App shell + generated icons: cache-first (fast repeat loads, offline shell).
 *  - Public booking reads (GET /api/bookings/code/<code>): network-first with a
 *    cache fallback, so the LAST-VIEWED booking renders offline. The QR itself is
 *    redrawn client-side from the cached bookingCode/ticketCode — we only need the
 *    JSON to survive.
 *  - Navigations: network-first, falling back to a cached page then the shell so
 *    a hard reload offline still boots the app.
 *
 * Safety:
 *  - NEVER cache authenticated/admin responses. We only ever cache-store two
 *    things: same-origin static assets, and the explicitly public, unauthenticated
 *    GET /api/bookings/code/* endpoint (keyed by an unguessable bookingCode).
 *  - Any request carrying an Authorization header, or any non-GET request, is
 *    passed straight through to the network and never touched.
 *  - Versioned cache names + a cleanup on activate prevent stale-forever content.
 */

const VERSION = "v1";
const SHELL_CACHE = `tiqr-shell-${VERSION}`;
const BOOKINGS_CACHE = `tiqr-bookings-${VERSION}`;

// Minimal app-shell precache. Kept tiny on purpose: Next hashes its JS/CSS, so
// those are picked up at runtime by the static-asset handler rather than listed
// here (which would go stale every build).
const SHELL_ASSETS = [
  "/",
  "/booking-confirmation",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic-ish: if one asset 404s it rejects. Add individually so a
      // single missing route (e.g. a not-yet-built page) never blocks install.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            /* best-effort precache */
          })
        )
      );
      // Activate this SW immediately on first install so offline works sooner.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("tiqr-") && ![SHELL_CACHE, BOOKINGS_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Allow the page to trigger an immediate takeover after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isPublicBookingRead(url) {
  // Public, unauthenticated: GET /api/bookings/code/<bookingCode>
  return /\/api\/bookings\/code\/[^/]+$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only ever handle GETs. Never touch POST/PUT/PATCH/DELETE (bookings, auth…).
  if (req.method !== "GET") return;

  // Never cache anything that carries credentials/authorization.
  if (req.headers.has("authorization")) return;

  const url = new URL(req.url);

  // Public booking reads: network-first, fall back to the cached copy offline.
  if (isPublicBookingRead(url)) {
    event.respondWith(networkFirstBooking(req));
    return;
  }

  // Only same-origin beyond this point.
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first with a shell fallback so a cold offline load
  // still boots the SPA.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  // The web app manifest is precached; serve it cache-first so it survives offline.
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Static assets (Next chunks, icons, images, fonts): cache-first.
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname) || url.pathname.startsWith("/_next/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function networkFirstBooking(req) {
  const cache = await caches.open(BOOKINGS_CACHE);
  try {
    const res = await fetch(req);
    // Only cache genuine successes; a 404/500 must not overwrite a good copy.
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // No cached booking — a minimal JSON so the page can show an offline notice
    // instead of an unhandled fetch rejection.
    return new Response(
      JSON.stringify({ success: false, error: { code: "OFFLINE", message: "You are offline and this ticket was not saved for offline use." } }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function networkFirstNavigation(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = (await cache.match(req)) || (await cache.match("/booking-confirmation")) || (await cache.match("/"));
    if (cached) return cached;
    return new Response("<h1>Offline</h1><p>This page is not available offline.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}
