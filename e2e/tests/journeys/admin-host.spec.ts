import { test, expect, APIRequestContext } from "@playwright/test";
import { apiContext, signupPrimedSession, primeAuth, Session } from "../_helpers";

// JOURNEY: the privileged dashboards render for a logged-in privileged user.
// We sign up a real user, then prime localStorage with an elevated role
// (ADMIN/EDITOR) — there is no public API to actually promote a user, so the
// role is synthetic and the client-side route guards (which only check that a
// token is present + read the stored role) admit us on that basis. The goal is
// that the dashboard SHELL loads (no redirect to a sign-in page); the dashboards'
// own data fetches are best-effort and degrade gracefully, so a real access
// token isn't required. We deliberately avoid the rate-limited /api/auth/signin
// call here to keep the suite deterministic under repeated runs. Requires a DB.
test.skip(!process.env.E2E_HAS_DB, "requires a seeded database");

let api: APIRequestContext;
let session: Session;

test.beforeAll(async () => {
  api = await apiContext();
  session = await signupPrimedSession(api, { name: "Dashboard User" });
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe("privileged dashboards", () => {
  test("admin dashboard loads for an ADMIN user", async ({ page }) => {
    await primeAuth(page, session, { role: "ADMIN", managedFestId: 1 });

    await page.goto("/admin/dashboard");

    // Not bounced to the admin sign-in guard.
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page).not.toHaveURL(/\/admin\/signin/);

    // The admin shell (sidebar) is present regardless of fest assignment.
    await expect(page.getByText(/admin panel/i)).toBeVisible();

    // "Role Approval Requests" lives under its own sidebar section (not the
    // default Overview tab) — switch to it before asserting the heading.
    await page.getByRole("button", { name: "Role Approvals" }).click();
    await expect(
      page.getByRole("heading", { name: /role approval requests/i })
    ).toBeVisible();
  });

  test("host dashboard loads for an EDITOR user", async ({ page }) => {
    await primeAuth(page, session, { role: "EDITOR", editorFestId: 1 });

    await page.goto("/host/dashboard");

    // Not bounced to the general sign-in page.
    await expect(page).toHaveURL(/\/host\/dashboard/);
    await expect(page).not.toHaveURL(/\/signin/);

    // The host shell header is present.
    await expect(page.getByRole("heading", { name: /host dashboard/i })).toBeVisible();
  });
});
