import { test, expect, APIRequestContext } from "@playwright/test";
import { apiContext, createEvent, bookingBody, signupUser, SeededEvent } from "../_helpers";

// JOURNEY (OPS-05): inventory is held the instant a PENDING booking is created;
// cancelling it must RESTORE ticketType.sold (not merely flip booking status).
// Asserts on the freed inventory, not just the status. Requires a database.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;
let event: SeededEvent;

test.beforeAll(async () => {
  api = await apiContext();
  event = await createEvent(api, {
    name: `Cancel Restore ${Date.now()}`,
    ticketTypes: [{ name: "General", price: 100, quantity: 30, description: "General admission" }],
  });
});

test.afterAll(async () => {
  await api?.dispose();
});

async function soldFor(eventId: number, ticketName: string): Promise<number> {
  const res = await api.get(`/api/events/${eventId}`);
  const data = (await res.json()).data;
  return data.ticketTypes.find((t: { name: string; sold: number }) => t.name === ticketName).sold;
}

test.describe("cancel-restore journey", () => {
  test("cancelling a PENDING booking returns ticketType.sold to its prior value", async () => {
    const before = await soldFor(event.id, "General");

    // Book as a registered buyer so the same user can cancel their own booking.
    const buyer = await signupUser(api, { name: "Cancel Buyer" });
    const qty = 3;
    const res = await api.post("/api/bookings", {
      headers: { Authorization: `Bearer ${buyer.token}` },
      data: bookingBody(event, { quantity: qty }),
    });
    expect(res.status()).toBe(201);
    const booking = (await res.json()).data;
    expect(booking.userId).toBe(buyer.userId);

    // Inventory held immediately on creation.
    expect(await soldFor(event.id, "General")).toBe(before + qty);

    // The buyer cancels their own still-PENDING booking.
    const cancel = await api.put(`/api/bookings/${booking.id}/cancel`, {
      headers: { Authorization: `Bearer ${buyer.token}` },
    });
    expect(cancel.status()).toBe(200);

    // The freed seats are back — the actual restore, not just a status change.
    expect(await soldFor(event.id, "General")).toBe(before);
  });
});
