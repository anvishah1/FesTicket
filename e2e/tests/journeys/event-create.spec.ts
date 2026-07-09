import { test, expect, APIRequestContext } from "@playwright/test";
import { apiContext, createEvent } from "../_helpers";

// JOURNEY (OPS-05): a HOST creates a PUBLISHED + PUBLIC event, which then appears
// on public discovery. The public events list (GET /api/events) is exactly what
// the /events discovery page renders, and it only returns PUBLISHED + PUBLIC
// events — so finding the event there proves it is discoverable. Requires a DB.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await apiContext();
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe("event-create journey", () => {
  test("a HOST-created published event surfaces on public discovery", async () => {
    const name = `Discoverable Gig ${Date.now()}`;
    // createEvent signs a HOST token and posts a PUBLISHED + PUBLIC event.
    const event = await createEvent(api, {
      name,
      ticketTypes: [{ name: "General", price: 250, quantity: 15, description: "Entry" }],
    });
    expect(event.id).toBeGreaterThan(0);

    // Search the public listing by the unique name; the event must be present.
    const res = await api.get(`/api/events?search=${encodeURIComponent(name)}`);
    expect(res.status()).toBe(200);
    const list = (await res.json()).data as Array<{ id: number; name: string }>;
    expect(list.some((e) => e.id === event.id && e.name === name)).toBe(true);
  });
});
