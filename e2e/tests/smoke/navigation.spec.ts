import { test, expect } from "@playwright/test";
import { ROUTES } from "../_helpers";

// Exercises the key navigation paths. All targets are static shells, so these
// pass without a database (the /fests data fetch fails gracefully to an empty
// state but the page heading still renders).

test.describe("navigation (smoke)", () => {
  test("header 'Sign In' link opens the sign-in page", async ({ page }) => {
    await page.goto(ROUTES.home);

    await page
      .getByRole("banner")
      .getByRole("link", { name: /sign in/i })
      .click();

    await expect(page).toHaveURL(/\/signin$/);
    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible();
  });

  test("header 'Discover' link opens the discover-fests page", async ({ page }) => {
    await page.goto(ROUTES.home);

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Discover", exact: true })
      .click();

    await expect(page).toHaveURL(/\/fests$/);
    await expect(
      page.getByRole("heading", { name: /discover fests/i })
    ).toBeVisible();
  });

  test("brand logo returns to home", async ({ page }) => {
    await page.goto(ROUTES.fests);

    await page
      .getByRole("banner")
      .getByRole("link", { name: /FesTicket/i })
      .click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("public /fests route renders directly (DB-independent)", async ({
    page,
  }) => {
    // Navigate straight to the public listing; even with no DB (empty/error
    // fetch) the page heading must render.
    await page.goto(ROUTES.fests);

    await expect(
      page.getByRole("heading", { name: /discover fests/i })
    ).toBeVisible();
  });
});
