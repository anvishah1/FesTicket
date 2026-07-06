import { test, expect } from "@playwright/test";

// An unknown route should resolve to Next.js's not-found page with a 404
// status. No DB involved.

test.describe("unknown route (smoke)", () => {
  test("returns a 404 and renders a not-found page", async ({ page }) => {
    const resp = await page.goto("/this-route-should-never-exist-1a2b3c");

    // Next.js App Router serves the default not-found with a real 404 status.
    expect(resp?.status()).toBe(404);

    // Copy-agnostic: default not-found shows "404" and/or "could not be found".
    await expect(
      page.getByText(/404|could ?n['o]t be found|not found/i).first()
    ).toBeVisible();
  });
});
