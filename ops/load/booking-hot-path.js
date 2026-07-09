// ops/load/booking-hot-path.js
// OPS-06: k6 load/soak of the booking inventory hot path. Seeds ONE ticket type
// with capacity C, then fires C+OVERSHOOT qty-1 GUEST bookings concurrently at it.
// The atomic guarded `updateMany` (sold <= quantity - qty) + the
// ticket_sold_lte_quantity CHECK constraint must let EXACTLY C succeed; the losers
// must get a clean 409 SOLD_OUT (never a 500 or an oversell).
//
//   k6 run -e JWT_SECRET=<same-as-backend> -e BASE_URL=http://localhost:4000 \
//          ops/load/booking-hot-path.js
//
// NOTE: the backend bookingLimiter caps ONE IP at 30 booking POSTs/min, so a
// single-host burst must stay <= 30 or the losers would 429 instead of 409. Keep
// CAPACITY + OVERSHOOT <= 30 (default 15 + 10 = 25). A larger soak needs the
// limiter relaxed for the dedicated load environment.
import http from "k6/http";
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:4000";
const SECRET = __ENV.JWT_SECRET || "";
const CAPACITY = parseInt(__ENV.CAPACITY || "15", 10);
const OVERSHOOT = parseInt(__ENV.OVERSHOOT || "10", 10);
const ITERATIONS = CAPACITY + OVERSHOOT;

const created = new Counter("bookings_created_201");
const soldOut = new Counter("bookings_soldout_409");
const server5xx = new Counter("bookings_server_5xx");

export const options = {
  scenarios: {
    // vus === iterations => every VU races exactly one booking near-simultaneously.
    oversell_burst: {
      executor: "shared-iterations",
      vus: ITERATIONS,
      iterations: ITERATIONS,
      maxDuration: "1m",
    },
  },
  thresholds: {
    // No oversell: EXACTLY capacity succeed; the remainder are clean 409s; no 5xx.
    bookings_created_201: [`count==${CAPACITY}`],
    bookings_soldout_409: [`count==${OVERSHOOT}`],
    bookings_server_5xx: ["count==0"],
    checks: ["rate==1.0"],
    // Latency budget — the job fails if p50/p95/p99 regress past these.
    http_req_duration: ["p(50)<1500", "p(95)<5000", "p(99)<8000"],
  },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function b64url(objOrStr) {
  const s = typeof objOrStr === "string" ? objOrStr : JSON.stringify(objOrStr);
  return encoding.b64encode(s, "rawurl");
}
// Mint an HS256 JWT that authMiddleware will accept (matches e2e/_helpers signJwt).
function signJwt(userId, role) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({ userId, role, iat: now, exp: now + 3600 });
  const sig = crypto.hmac("sha256", SECRET, `${head}.${body}`, "base64rawurl");
  return `${head}.${body}.${sig}`;
}

export function setup() {
  if (!SECRET) throw new Error("JWT_SECRET env is required (must match the backend)");

  // 1) A host user (POST /api/events needs a privileged token).
  const email = `k6.host.${Date.now()}@example.com`;
  const signup = http.post(
    `${BASE}/api/auth/signup`,
    JSON.stringify({ email, password: "Password1!", name: "k6 host" }),
    { headers: JSON_HEADERS }
  );
  if (![201, 409].includes(signup.status)) {
    throw new Error(`signup failed: ${signup.status} ${signup.body}`);
  }
  const uid = signup.json("data.userId");
  if (typeof uid !== "number") throw new Error("no userId from signup");
  const token = signJwt(uid, "HOST");

  // 2) A PUBLISHED event with a single low-stock ticket type (capacity = C).
  const start = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const end = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString();
  const evt = http.post(
    `${BASE}/api/events`,
    JSON.stringify({
      festId: null,
      name: `k6 Oversell ${Date.now()}`,
      shortDescription: "k6",
      description: "k6 oversell soak",
      category: "Concert",
      venue: "Load Hall",
      venueAddress: "Load Hall, Campus",
      startDate: start,
      endDate: end,
      startTime: "18:00",
      visibility: "PUBLIC",
      status: "PUBLISHED",
      ticketTypes: [{ name: "General", price: 100, quantity: CAPACITY, description: "GA" }],
    }),
    { headers: Object.assign({ Authorization: `Bearer ${token}` }, JSON_HEADERS) }
  );
  if (evt.status !== 201) throw new Error(`event create failed: ${evt.status} ${evt.body}`);
  const data = evt.json("data");
  return { eventId: data.id, ticketTypeId: data.ticketTypes[0].id, capacity: CAPACITY };
}

export default function (data) {
  const body = JSON.stringify({
    eventId: data.eventId,
    guestEmail: `k6.buyer.${__VU}.${__ITER}@example.com`,
    tickets: [{ ticketTypeId: data.ticketTypeId, quantity: 1 }],
    attendees: [
      { ticketTypeId: data.ticketTypeId, name: `k6 ${__VU}`, email: `k6.att.${__VU}.${__ITER}@example.com` },
    ],
  });
  const res = http.post(`${BASE}/api/bookings`, body, { headers: JSON_HEADERS });
  if (res.status === 201) created.add(1);
  else if (res.status === 409) soldOut.add(1);
  else if (res.status >= 500) server5xx.add(1);
  check(res, {
    "booking is 201 or 409 (never oversell / 500)": (r) => r.status === 201 || r.status === 409,
  });
}

export function teardown(data) {
  const res = http.get(`${BASE}/api/events/${data.eventId}`);
  const tt = res.json("data.ticketTypes").find((t) => t.id === data.ticketTypeId);
  const sold = tt ? tt.sold : -1;
  console.log(`[oversell] final sold=${sold} capacity=${data.capacity} quantity=${tt && tt.quantity}`);
  // Belt-and-suspenders on top of the thresholds: sold must equal capacity and
  // never exceed the ticket type's quantity.
  if (sold !== data.capacity) throw new Error(`OVERSELL/UNDERSELL: sold ${sold} != capacity ${data.capacity}`);
  if (tt && sold > tt.quantity) throw new Error(`OVERSELL: sold ${sold} > quantity ${tt.quantity}`);
}
