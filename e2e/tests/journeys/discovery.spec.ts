import { test, expect, APIRequestContext } from "@playwright/test";
import { ROUTES, apiContext, createEvent, SeededEvent } from "../_helpers";

// JOURNEY: browse the public /fests listing, then open a seeded event and reach
// its booking entry point. Requires a working database.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;
let event: SeededEvent;

test.beforeAll(async () => {
  api = await apiContext();
  event = await createEvent(api, {
    name: `Discovery Fest Night ${Date.now()}`,
    ticketTypes: [
      { name: "General", price: 150, quantity: 40, description: "Standard entry" },
      { name: "VIP", price: 500, quantity: 10, description: "Front row + lounge" },
    ],
  });
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe("discovery journey", () => {
  test("the public fests listing renders", async ({ page }) => {
    await page.goto(ROUTES.fests);

    // The heading is static; it renders whether the listing is populated, empty,
    // or still loading — so this is resilient to DB contents.
    await expect(page.getByRole("heading", { name: /discover fests/i })).toBeVisible();

    // The listing resolves out of its loading state to either cards or an
    // explicit empty message (never stuck on "Loading fests...").
    await expect(page.getByText(/loading fests/i)).toHaveCount(0);
  });

  test("opening an event shows its tickets and a booking CTA", async ({ page }) => {
    await page.goto(`/events/${event.id}`);

    await expect(page.getByRole("heading", { name: event.name })).toBeVisible();

    // Both seeded ticket tiers appear on the event page.
    await expect(page.getByText("General").first()).toBeVisible();
    await expect(page.getByText("VIP").first()).toBeVisible();

    // The primary CTA takes the visitor into the booking flow.
    const bookBtn = page.getByRole("button", { name: /book tickets/i });
    await expect(bookBtn).toBeVisible();
    await bookBtn.click();

    await expect(page).toHaveURL(new RegExp(`/events/${event.id}/booking`));
    await expect(page.getByRole("heading", { name: /choose tickets/i })).toBeVisible();
  });
});
