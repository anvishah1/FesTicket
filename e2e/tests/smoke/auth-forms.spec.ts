import { test, expect } from "@playwright/test";
import { ROUTES } from "../_helpers";

// Client-side validation only — these never depend on a backend/DB. Both forms
// gate their submit button on React state, and the sign-in email field also
// uses native (type=email + required) constraint validation. We verify that
// invalid/empty input keeps the user on the page and does not submit.

test.describe("sign-in form validation (smoke)", () => {
  test("submit stays disabled until email + password are provided", async ({
    page,
  }) => {
    await page.goto(ROUTES.signin);

    const submit = page.getByRole("button", { name: /sign in with email/i });
    await expect(submit).toBeDisabled();

    // Email alone is not enough.
    await page.getByPlaceholder("you@school.edu").fill("user@example.com");
    await expect(submit).toBeDisabled();

    // Both fields present -> button enables (still no navigation yet).
    await page.getByPlaceholder("Password").fill("secret123");
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("an invalid email format blocks submission (no navigation)", async ({
    page,
  }) => {
    await page.goto(ROUTES.signin);

    const email = page.getByPlaceholder("you@school.edu");
    await email.fill("not-an-email");
    await page.getByPlaceholder("Password").fill("secret123");

    // Button is enabled (fields non-empty) but native validation should block
    // the actual submit because the email is malformed.
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await expect(page).toHaveURL(/\/signin$/);
    const valid = await email.evaluate(
      (el) => (el as HTMLInputElement).validity.valid
    );
    expect(valid).toBe(false);
  });
});

test.describe("sign-up form validation (smoke)", () => {
  test("submit is disabled by default", async ({ page }) => {
    await page.goto(ROUTES.signup);

    await expect(
      page.getByRole("button", { name: /sign up with email/i })
    ).toBeDisabled();
  });

  test("mismatched passwords keep submit disabled", async ({ page }) => {
    await page.goto(ROUTES.signup);

    await page.getByPlaceholder("you@school.edu").fill("student@example.com");
    await page.getByPlaceholder("At least 8 characters").fill("password123");
    await page.getByPlaceholder("Confirm password").fill("password999");
    await page.getByLabel(/i'?m not a robot/i).check();

    await expect(
      page.getByRole("button", { name: /sign up with email/i })
    ).toBeDisabled();
  });

  test("matching passwords + captcha enable submit (still on /signup)", async ({
    page,
  }) => {
    await page.goto(ROUTES.signup);

    await page.getByPlaceholder("you@school.edu").fill("student@example.com");
    // Password must satisfy the full complexity policy (upper/lower/number/special)
    // for the submit button to enable.
    await page.getByPlaceholder("At least 8 characters").fill("Password1!");
    await page.getByPlaceholder("Confirm password").fill("Password1!");
    await page.getByLabel(/i'?m not a robot/i).check();

    await expect(
      page.getByRole("button", { name: /sign up with email/i })
    ).toBeEnabled();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
