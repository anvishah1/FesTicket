import { test, expect, APIRequestContext } from "@playwright/test";
import { apiContext, createEvent, bookingBody, uniqueEmail, SeededEvent } from "../_helpers";

// JOURNEY (OPS-05): an UNAUTHENTICATED guest creates a booking and then retrieves
// it with only its unguessable bookingCode (the public guest lookup). Asserts on
// server state via the API. Requires a database.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;
let event: SeededEvent;

test.beforeAll(async () => {
  api = await apiContext();
  event = await createEvent(api, {
    name: `Guest Checkout ${Date.now()}`,
    ticketTypes: [{ name: "General", price: 200, quantity: 20, description: "General admission" }],
  });
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe("guest checkout journey", () => {
  test("a guest can book without an account and fetch it by bookingCode", async () => {
    const guestEmail = uniqueEmail("guest");

    // No Authorization header -> a genuine guest booking (userId stays null).
    const res = await api.post("/api/bookings", {
      data: bookingBody(event, { quantity: 2, guestEmail }),
    });
    expect(res.status()).toBe(201);
    const created = (await res.json()).data;
    expect(created.bookingCode).toBeTruthy();
    expect(created.userId ?? null).toBeNull();
    expect(created.eventId).toBe(event.id);

    // Retrieve with ONLY the unguessable code via the public guest route.
    const look = await api.get(`/api/bookings/code/${created.bookingCode}`);
    expect(look.status()).toBe(200);
    const found = (await look.json()).data;
    expect(found.bookingCode).toBe(created.bookingCode);
    expect(found.eventId).toBe(event.id);
  });
});
