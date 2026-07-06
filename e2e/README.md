# tiqr E2E test suite (Playwright)

End-to-end tests that drive the **real** frontend against the **real** backend in a headless Chromium browser.

## Layout

- `tests/smoke/` — DB-independent specs (home page, navigation, client-side form
  validation, 404s). These pass with just the two servers running.
- `tests/journeys/` — full user journeys that read/write data (signup → browse →
  book → pay-demo, admin approval, host dashboard). These need a **database** and
  are seeded via the API in `global-setup.ts`.

## Prerequisites

1. Install deps + browser (once):
   ```bash
   cd e2e && npm install && npx playwright install chromium
   ```
2. The backend needs a working `DATABASE_URL` (Postgres/Neon). Create
   `backend/.env` with at least `DATABASE_URL` and `JWT_SECRET`, then from
   `backend/` run `npx prisma generate && npx prisma db push`.
   - Without a DB the backend still starts, but journey specs that need data
     will be skipped/failed. Smoke specs still run.
3. Razorpay is **not** required — payment journeys use the built-in demo flow
   (`PUT /api/bookings/:id/complete`) when `RAZORPAY_KEY_*` is unset.

## Running

```bash
# Playwright starts backend (:4000) + frontend (:3000) automatically:
npm run test:e2e

# If you already have both dev servers running:
E2E_NO_SERVER=1 npm run test:e2e

# Interactive UI / headed / report:
npm run test:e2e:ui
npm run test:e2e:headed
npm run report
```

Set `E2E_HAS_DB=1` to enable the journey specs (they self-skip otherwise so the
smoke suite stays green in DB-less environments).
