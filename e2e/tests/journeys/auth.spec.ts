import { test, expect } from "@playwright/test";
import { ROUTES, STRONG_PASSWORD, uniqueEmail, ACCESS_TOKEN_KEY, USER_KEY } from "../_helpers";

// JOURNEY: real sign-up then sign-in, driven entirely through the UI, ending
// with tokens persisted in localStorage. Requires a working database.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

test.describe("auth journey (signup -> signin)", () => {
  test("a new user can sign up and then sign in, persisting tokens", async ({ page }) => {
    const email = uniqueEmail("journey-auth");

    // ---- Sign up via the UI ----
    await page.goto(ROUTES.signup);

    await page.getByPlaceholder("Your name").fill("Journey Tester");
    await page.getByPlaceholder("you@school.edu").fill(email);
    await page.getByPlaceholder("At least 8 characters").fill(STRONG_PASSWORD);
    await page.getByPlaceholder("Confirm password").fill(STRONG_PASSWORD);
    await page.getByLabel(/i'?m not a robot/i).check();

    const signupBtn = page.getByRole("button", { name: /sign up with email/i });
    await expect(signupBtn).toBeEnabled();
    await signupBtn.click();

    // Non-editor signup shows a success confirmation screen.
    await expect(page.getByText(/account created/i)).toBeVisible();

    // ---- Sign in via the UI ----
    await page.goto(ROUTES.signin);
    await page.getByPlaceholder("you@school.edu").fill(email);
    await page.getByPlaceholder("Password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: /sign in with email/i }).click();

    // A VIEWER lands back on the home page (not admin/host dashboards).
    await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/\/signin/);

    // Tokens + user are persisted in localStorage (see frontend/lib/auth.ts).
    const stored = await page.evaluate(
      ([tokenKey, userKey]) => ({
        token: window.localStorage.getItem(tokenKey),
        user: window.localStorage.getItem(userKey),
      }),
      [ACCESS_TOKEN_KEY, USER_KEY]
    );
    expect(stored.token, "access token should be stored").toBeTruthy();
    expect(stored.user, "user should be stored").toBeTruthy();

    const user = JSON.parse(stored.user as string);
    expect(user.email).toBe(email);
  });
});
