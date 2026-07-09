import { test, expect } from "@playwright/test";
import { ROUTES } from "../_helpers";

// DB-independent: the home page is fully static React, so it renders whether or
// not the backend has a database. We assert on stable roles / hrefs / brand
// text rather than marketing copy that is likely to change.

test.describe("home page (smoke)", () => {
  test("renders the hero and brand", async ({ page }) => {
    await page.goto(ROUTES.home);

    // There is exactly one top-level hero heading on the landing page.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Brand mark lives in the sticky header (role=banner).
    await expect(page.getByRole("banner")).toContainText(/FesTicket/i);
  });

  test("exposes the primary calls-to-action", async ({ page }) => {
    await page.goto(ROUTES.home);

    // Sign-in entry point in the header.
    await expect(
      page.getByRole("banner").getByRole("link", { name: /sign in/i })
    ).toBeVisible();

    // "Start hosting" / discover CTAs link to the auth + fests routes. Use
    // href locators (copy-agnostic) and only require that at least one exists.
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
    await expect(page.locator('a[href="/fests"]').first()).toBeVisible();
  });
});
