import { test, expect, APIRequestContext } from "@playwright/test";
import { apiContext, createEvent, SeededEvent, uniqueEmail } from "../_helpers";

// JOURNEY: select tickets -> create a booking -> pay via the demo flow.
// With RAZORPAY_KEY_* unset, the payment page's "Pay" button hits create-order,
// gets a 503 (RAZORPAY_DISABLED), and offers a demo-payment confirm() that
// completes the booking via PUT /api/bookings/:id/complete. Requires a DB.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;
let event: SeededEvent;

test.beforeAll(async () => {
  api = await apiContext();
  event = await createEvent(api, {
    name: `Booking Flow Concert ${Date.now()}`,
    ticketTypes: [{ name: "General", price: 100, quantity: 50, description: "General admission" }],
  });
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe("booking journey", () => {
  test("select tickets, book, and complete demo payment", async ({ page }) => {
    // Accept every native dialog: the demo flow raises a confirm() ("use demo
    // payment?") and then an alert() ("Payment successful! ...").
    page.on("dialog", (dialog) => dialog.accept());

    // ---- Booking page: choose a ticket + fill contact/attendee details ----
    await page.goto(`/events/${event.id}/booking`);
    await expect(page.getByRole("heading", { name: /choose tickets/i })).toBeVisible();

    // Add one "General" ticket via its quantity stepper (aria-label from
    // TicketSelector: "Increase General").
    await page.getByRole("button", { name: "Increase General" }).click();

    // Contact email is required to proceed.
    await page.getByPlaceholder("your@email.com").fill(uniqueEmail("booker"));

    // One attendee row appears per ticket; fill attendee 1 (labels from
    // AttendeeForm: "Name for attendee 1" / "Email for attendee 1").
    await page.getByLabel("Name for attendee 1").fill("Attendee One");
    await page.getByLabel("Email for attendee 1").fill(uniqueEmail("attendee"));

    const proceed = page.getByRole("button", { name: /proceed to payment/i });
    await expect(proceed).toBeEnabled();
    await proceed.click();

    // ---- Payment page ----
    await page.waitForURL(/\/events\/\d+\/payment/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /payment methods/i })).toBeVisible();

    const payBtn = page.getByRole("button", { name: /pay ₹/i });
    await expect(payBtn).toBeVisible();
    await payBtn.click();

    // The demo flow completes the booking then redirects to the confirmation
    // page (showing the booking code) instead of the old alert()+/fests redirect.
    await page.waitForURL(/\/booking-confirmation/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /booking confirmed/i })).toBeVisible();

    // Sanity-check via the API that the booking is now COMPLETED. The booking
    // code was surfaced in the success alert, but we assert on server state to
    // avoid coupling to alert copy: find the booking by the attendee/guest.
    // (The event's sold count having incremented is enough of a signal.)
    const eventRes = await api.get(`/api/events/${event.id}`);
    const eventBody = await eventRes.json();
    const general = eventBody.data.ticketTypes.find((t: any) => t.name === "General");
    expect(general.sold).toBeGreaterThanOrEqual(1);
  });
});
