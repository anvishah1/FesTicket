# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**FesTicket** — a production-track event ticketing/booking app for college fests. Two independent apps in one repo (no root `package.json`; install and run each separately):

- `backend/` — Express 5 API (ESM) + Prisma + PostgreSQL (Neon). Entry: `backend/index.js`.
- `frontend/` — Next.js 16 App Router + React 19 + Tailwind 3 (TypeScript).
- `e2e/` — Playwright end-to-end journeys driving both apps together.
- `ops/` — deploy runbook and Grafana dashboard for the staging→prod pipeline.

## Commands

Backend (run from `backend/`):
```bash
npm install
npx prisma generate          # after any schema change or fresh clone
npx prisma migrate deploy    # apply committed migrations (ARCH-08 — NOT db push)
npm run migrate:dev          # after editing schema.prisma: create + apply a new migration
npm run migrate:status       # check pending/applied migrations
npm run dev                  # = node index.js, serves on PORT (default 4000)
npm test                     # Vitest + supertest (Prisma mocked; no DB needed)
npm run test:integration     # INTEGRATION_DB=1 — needs a real Postgres + migrations applied
npx prisma studio            # inspect/edit data
```

Frontend (run from `frontend/`):
```bash
npm install
npm run dev                  # Next dev server on :3000
npm test                     # Vitest + React Testing Library
npm run build && npm start   # production
npm run lint                 # eslint (flat config, eslint-config-next)
npx tsc --noEmit             # typecheck
```

End-to-end (run from `e2e/`) — self-skips unless a database is available:
```bash
npx playwright install --with-deps chromium
E2E_HAS_DB=1 npx playwright test   # needs DATABASE_URL set + `prisma migrate deploy` already run
```

Schema changes go through **Prisma Migrate** (migration files under `backend/prisma/migrations/`), not `db push`. CI runs `prisma migrate deploy` against a throwaway Postgres for both the `integration` and `e2e` jobs. Health: `GET /api/hello`; readiness (`SELECT 1`, hard-fails on DB down): `GET /api/ready` (`?deep=1` adds a soft, memoized `degraded` check for Razorpay/SMTP that never 503s). Metrics: `GET /api/metrics` (Prometheus; open in dev, requires `Authorization: Bearer $METRICS_TOKEN` in production). Interactive API docs at `GET /api/docs` (OpenAPI JSON at `GET /api/openapi.json`).

### Operational scripts (run from `backend/`)
Onboarding is partly CLI-driven — there is no in-app UI to approve *admin* requests:
```bash
node src/scripts/approveAdminRequest.js <requestId> <email> <password> <festId|new> <key> [festName] [college]
node src/scripts/setFestAdminKey.js <festId> <key> [adminEmail]
node src/scripts/makeAdmin.js         # promote a user to ADMIN
node src/scripts/createDefaultHost.js
```

## Architecture

### Fest-scoped multi-tenancy (the core model)
Everything is scoped to a **Fest**. A `User.role` is one of `VIEWER | EDITOR | HOST | ADMIN`, and two nullable FKs decide which fest's data a user sees:
- `User.managedFestId` — the fest an **ADMIN** owns (unique; admin dashboard queries filter by this).
- `User.editorFestId` — the fest an **EDITOR/HOST** was approved for (host dashboard, marketing, event-manage use this).
- `Fest.adminKey` — the "fest key" string. Students type it at signup to prove which fest they belong to; the backend matches it against `Fest.adminKey`.

When adding admin/host-facing queries, **always scope by the caller's fest id** — cross-tenant leaks are the main risk here. `GET /api/user/me` returns `managedFestId`/`editorFestId` and self-heals a missing admin `managedFestId` from that admin's approved `AdminRequest`.

### Two onboarding flows (don't conflate them)
1. **Admin (professor)** → `/admin/signup` creates an `AdminRequest` (PENDING). A developer approves it **manually** with `approveAdminRequest.js`, which creates/links a `Fest`, sets its `adminKey`, and sets the user to `role=ADMIN` + `managedFestId`.
2. **Editor (student)** → `/signup` with "become Editor" + fest key creates a `RoleRequest` (PENDING) for the matched fest. The fest's **ADMIN** approves in-app (`PATCH /api/role-requests/:id`, admin dashboard), which sets the user's `role` + `editorFestId`.

### Auth
- Access token: JWT, 15 min, payload `{ userId, role }`. **Note the shape** — read `req.user.userId` (not `req.user.id`) and `req.user.role` in route handlers.
- Refresh token: opaque random string stored in the `RefreshToken` table, 7-day expiry, **rotated** on every `/api/auth/refresh-token` (each row carries a `familyId`; reusing a revoked token is a replay signal).
- Middleware in `src/middleware/authMiddleware.js`: `authenticateUser`, `optionalAuthenticate` (never fails), `authorizeRoles(...roles)`.
- Login lockout: 5 failed attempts → 15-min lock (`failedLoginAttempts`/`lockUntil` on User). Login and signup are rate-limited (`src/middleware/rateLimiter.js`) and gated by `src/utils/captcha.js` (Cloudflare Turnstile) — graceful no-op when `CAPTCHA_SECRET` is unset, fails **closed** on any verification error once configured.
- `tokenVersion` (on User) is carried in the access-token payload and checked against the DB by the middleware — a password/role change or account delete bumps it to invalidate live tokens. A soft-deleted user (`User.deletedAt` set, AUTH-04) is treated as nonexistent everywhere.
- **2FA (AUTH-08):** opt-in TOTP, enrolled via a not-yet-confirmed `twoFactorPendingSecret` promoted to `twoFactorSecret` on first valid code; secrets are AES-256-GCM encrypted at rest (`src/utils/twofactor.js`, key = `TWO_FACTOR_ENC_KEY` falling back to `JWT_SECRET`), backup codes stored as SHA-256 hashes. Every interactive login path (password, magic-link, Google) routes through `issueSessionOr2FAChallenge`: with 2FA on, it withholds the session and returns a short-lived `challengeToken` instead, redeemed at `/2fa/verify`.
- **Magic-link login (AUTH-06):** `MagicLinkToken` table, single-use, hashed at rest, 15-min TTL. `/auth/magic-link` is enumeration-safe (always 200); with SMTP unset the link is logged instead of emailed. Also funnels through the 2FA challenge gate.
- Body validation: zod schemas in `src/validators/` applied via `validate(schema)` middleware (`src/middleware/validate.js`), which replaces `req.body` with parsed data and fails via the unified envelope (`res.fail(400, "VALIDATION_ERROR", ..., { field: msg })`).
- Email verification (AUTH-01): enforced **only when a mail provider is configured** (`isMailConfigured()`); with SMTP unset, signup still auto-verifies (`emailVerified: true`) so dev/E2E are unchanged. Real branded emails in `src/utils/email.js` (verify/reset/welcome/booking); sends are non-blocking.
- Account self-service (AUTH-02/03/04): `POST /api/auth/change-password`, `PATCH /api/user/me`, `DELETE /api/user/me` (typed-email soft-delete), session list/revoke (`/api/auth/sessions`), and in-app organizer upgrade (`/api/role-requests`).
- Frontend keeps `accessToken` / `refreshToken` / `user` in **localStorage** via helpers in [frontend/lib/auth.ts](frontend/lib/auth.ts).

### Money is INTEGER PAISE (PAY-03)
All money columns/fields are **integer paise**, not rupee floats. Fees use integer math: `platformFee = round(subtotal*0.02)`, `tax = round((subtotal+platformFee)*0.18)`, `total = subtotal + platformFee + tax`; discounts stack as `discountedBase = subtotal - eventDiscount - promoDiscount` (clamped ≥ 0). Non-negative CHECK constraints back this. Frontend renders via `formatPaise(paise)` / `paiseToRupeeString(paise)` in `frontend/lib/format.ts` — never print a raw paise value as rupees.

### Booking & payment flow (`src/routes/bookings.js`)
1. `POST /api/bookings` — creates a **PENDING** booking in a Prisma `$transaction`: validates availability, computes fees (integer paise), optionally redeems a promo code atomically, creates items/attendees, and **increments `TicketType.sold` immediately** via a guarded `updateMany` (inventory held at booking creation).
2. `POST /api/bookings/:id/create-order` — creates a Razorpay order (paise) + a PENDING `Payment`.
3. `POST /api/bookings/:id/verify-payment` — verifies the captured payment (order-bound + amount-checked), then settles via the shared PENDING-guarded `settleBookingAsPaid` (idempotent) and emails.
4. `POST /api/bookings/webhook/razorpay` (PAY-01) — HMAC-verified webhook (mounted with `express.raw` before `express.json`), idempotent via `WebhookEvent`; settles/fails server-side. `reconcileStalePaidOrders` recovers stuck orders and releases abandoned ones.
5. `POST /api/bookings/:id/refund` (host/admin) and `POST /api/bookings/:id/request-refund` (buyer, PAY-06) both run the shared `runRefund` engine (self-heal + two-attempt reservation + gateway + finalize). `PUT /:id/complete` is the demo fallback; `PUT /:id/cancel` restores `sold`.
6. `GET /api/bookings/:id/invoice` (PAY-07) streams a GST invoice PDF; `invoiceNumber` is assigned once at completion.
7. Every inventory release (cancel / sweep-expire / refund) calls `releaseToWaitlist` (PAY-08, `src/utils/waitlist.js`) **after** the releasing transaction commits — it atomically flips the oldest `WAITING` row(s) on that `TicketType` to `NOTIFIED` and emails a 30-minute claim link; a background sweep expires unclaimed `NOTIFIED` rows and re-offers the seat. It's a soft hold, not a real reservation.

**Graceful degradation:** Razorpay and email are optional. If `RAZORPAY_KEY_*` is unset, order/verify/refund endpoints 503/demo and the frontend uses a demo flow. If SMTP is unset, emails are skipped and signup auto-verifies. This is a repo-wide pattern (see also captcha, SMS, wallet passes, Sentry, metrics below) — design new integrations the same way: absent config degrades functionality, it never crashes the request.

### Ticketing & event day
- **QR / per-attendee tickets (TIX-01/02):** each `Attendee` gets a unique `ticketCode` (cuid); `src/utils/email.js` renders the booking's `bookingCode` as an inline QR in confirmation emails (falls back to plain text). Check-in (`POST /api/bookings/checkin`) looks up `Attendee.ticketCode` and atomically sets `checkedInAt`/`checkedInById` via an `updateMany` guarded on `checkedInAt: null` (first-scan-wins; `/checkin/undo` reverts). Ticket transfer reissues a fresh `ticketCode` (invalidating the old QR), only allowed pre-check-in.
- **Wallet passes (TIX-07):** `src/utils/wallet.js`, `GET /api/bookings/code/:bookingCode/{apple,google}-pass`. Fully optional — Apple needs signed-cert env vars, Google needs a service-account; absent config returns `503 WALLET_DISABLED` and the frontend (`components/WalletButtons.tsx`) hides the buttons. Generated on-demand per request (not proactively at booking time), keyed on the attendee's `ticketCode` as the barcode payload.
- **Calendar (.ics, TIX-09):** `src/utils/ics.js`, a dependency-free RFC 5545 builder exposed at `GET /api/events/:id/calendar.ics`. Since events store no timezone, timed events are emitted as **floating** (no `Z`) local date-times so they render at the intended wall-clock time regardless of the importer's offset.

### Notifications & lifecycle comms
- **In-app bell (NOTIF-08):** `src/utils/notify.js` writes `Notification` rows — best-effort/fire-and-forget, no-ops for guests. `src/routes/notifications.js` serves cursor-paginated list + read/read-all; `components/NotificationBell.tsx` polls `GET /api/notifications` every 60s (paused when the tab is hidden).
- **Preferences (NOTIF-09):** per-category boolean opt-outs on `User` (`notifyReminders`/`notifySalesAlerts`/`notifySalesDigest`/`notifyMarketing`) gate only *non-transactional* mail — receipts, confirmations, and payment mail always send. Unsubscribe uses a long-lived signed JWT (`src/utils/notifications.js`), one-click per RFC 8058.
- **SMS (NOTIF-07):** `src/utils/sms.js` follows the same optional-provider pattern (`SMS_PROVIDER` env; unset ⇒ `{sent:false}`, never throws) but has no active call sites yet — a ready-to-wire capability, not a live send path.

### Observability, ops & deployment
- **Sentry** (`src/utils/sentry.js`, and `frontend/instrumentation*.ts`): fully optional — no-ops without `SENTRY_DSN` (backend) / `NEXT_PUBLIC_SENTRY_DSN` (frontend). Only genuine 5xx/uncaught errors are reported (never 4xx), and `beforeSend` scrubs auth headers/tokens/guest PII before send.
- **Metrics** (`src/utils/metrics.js`): Prometheus via `prom-client` — request-duration histogram (bounded route-template labels) plus business counters (`bookings_created_total`, `payment_success_total/failed_total`, `stale_expired_total`) at `GET /api/metrics`, token-gated in production.
- **Structured logging** (ARCH-09): use `req.log` (pino child bound to `requestId`) in handlers, not `console.log`; redacts auth/password/token fields. Throw `AppError`/`bookingError` for typed errors; the central handler in `index.js` maps them (only 500s get `sentryCapture`'d).
- **Background jobs:** a single `setInterval` in `index.js` (skipped under `NODE_ENV=test`) chains: stale-sweep (guarded by a Postgres advisory lock so only one replica runs it per tick) → checkout-recovery/event-reminder/sales-digest emails → waitlist-claim expiry → stale paid-order reconciliation.
- **CI/CD:** `.github/workflows/ci.yml` gates on backend/frontend unit tests, an `integration` job (real Postgres + `prisma migrate deploy`), a Playwright `e2e` job, and a `security` job (npm audit + gitleaks). `deploy.yml` builds one backend image (tag=sha), deploys to staging (own Neon branch, migrate + smoke-test `/health`/`/ready`), then promotes the **same digest** to production behind a manual-approval GitHub Environment — never a rebuild. See `ops/README.md` / `ops/deploy.md`.

### API response conventions (unified — ARCH-01)
All routes now emit the same envelope via `res.ok(data, {status,message})` / `res.fail(status, code, message, details?)` (`src/middleware/respond.js`): `{ success, data, error: { code, message, details? }, requestId }`. Every route (including `/health`, `/ready`, `/metrics`, `/docs`) is served under both `/api/v1/*` (preferred) and `/api/*` (deprecation alias, ARCH-04) — mount new routers in the `index.js` loop so both work.

### Frontend
- App Router under `frontend/app/`. Path alias `@/*` → project root (e.g. `@/lib/auth`, `@/components/...`).
- **All** backend calls must go through `getApiUrl()` from `@/lib/auth` (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000`) — never hardcode `http://localhost:4000`.
- Route areas: public (`fests`, `events/[id]/{booking,payment}`, `sponsor`), auth (`signin`/`signup`/`forgot`/`reset`), `admin/*` (scoped by `managedFestId`), `host/*` (scoped by `editorFestId`). Admin/host UI components live in `components/admin/`, `components/event-create/`, `components/payment/`.
- **i18n:** `next-intl`, locales `en`/`hi`, selected via the `NEXT_LOCALE` **cookie** — there is no `[locale]` route segment. The server always renders the default locale (`i18n/request.ts` hardcodes `"en"`) so pages stay statically/ISR-cacheable; `components/LocaleProvider.tsx` swaps messages client-side post-hydration. Don't "fix" this by resolving the locale server-side — that would opt every route into dynamic rendering.
- **SEO/PWA:** `app/sitemap.ts`/`app/robots.ts`/`app/manifest.ts`, `lib/eventJsonLd.ts` (schema.org JSON-LD, HTML-escaped before inlining), `app/_og/ogCard.tsx` (OG images via `next/og` `ImageResponse`). `components/ServiceWorkerRegistrar.tsx` + `public/sw.js` are production-only and scoped narrowly: cache the app shell and the single unauthenticated `GET /api/bookings/code/:code` endpoint so a saved ticket QR stays viewable offline at the gate — any authenticated or non-GET request always passes straight through, uncached.
- `lib/export/workbook.ts` builds the admin dashboard's multi-sheet xlsx export (dynamically imported to avoid a Turbopack crash; falls back to per-sheet CSV if the import fails).

## Gotchas & conventions
- **ESM backend:** `"type": "module"`; relative imports need explicit `.js` extensions.
- **Prisma client IS a shared singleton** now (ARCH-06): import the default export of `backend/src/prisma.js` (`import prisma from "../prisma.js"`). Do NOT `new PrismaClient()` in route files. Tests mock `@prisma/client` via `backend/__mocks__/@prisma/client.js` (`prismaMock`); add new models to its `MODEL_KEYS`.
- **Schema changes** go through Prisma Migrate: edit `schema.prisma`, `npm run migrate:dev` to generate + apply a migration under `prisma/migrations/`. Datasource is `postgresql` with a pooled `url` (`DATABASE_URL`) + unpooled `directUrl` (`DIRECT_URL`, required to exist even locally). The old `db.js` and `dev.db` are gone.
- **Database is PostgreSQL** (Neon in prod), `DATABASE_URL` in `backend/.env` — the app validates env at boot and exits if `DATABASE_URL`/`JWT_SECRET` are missing or too short. `.env.example` documents all runtime env: `PORT`, `FRONTEND_URL` (CORS), `PUBLIC_API_URL` (email links), `JWT_SECRET`, `DATABASE_URL`/`DIRECT_URL`, `RAZORPAY_KEY_*`/`RAZORPAY_WEBHOOK_SECRET`, `SMTP_*`/`MAIL_FROM`, plus the optional `SENTRY_DSN`, `METRICS_TOKEN`, `CAPTCHA_SECRET`, `TWO_FACTOR_ENC_KEY`, `APPLE_WALLET_*`/`GOOGLE_WALLET_*`.
- **File uploads** (expense proofs, sponsor agreements) are local-disk only for now (`src/utils/storage.js` decodes base64 data URLs into `backend/uploads/`, served statically, capped at 8MB) — no cloud storage abstraction yet.
- `IMPROVEMENTS-PLAN.md` is the phased roadmap (Phases 1–9, code-grounded spec of ~88 improvements); `PENDING-TASKS.md` is an older, mostly-superseded backlog from an earlier stage of the project. Check `IMPROVEMENTS-PLAN.md` first before assuming a feature is missing.
