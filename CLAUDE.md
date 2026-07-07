# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**tiqr** — an event ticketing/booking app for college fests. Two independent apps in one repo (no root `package.json`; install and run each separately):

- `backend/` — Express 5 API (ESM) + Prisma + PostgreSQL (Neon). Entry: `backend/index.js`.
- `frontend/` — Next.js 16 App Router + React 19 + Tailwind 3 (TypeScript).

## Commands

Backend (run from `backend/`):
```bash
npm install
npx prisma generate          # after any schema change or fresh clone
npx prisma migrate deploy    # apply committed migrations (ARCH-08 — NOT db push)
npm run migrate:dev          # after editing schema.prisma: create + apply a new migration
npm run dev                  # = node index.js, serves on PORT (default 4000)
npm test                     # Vitest + supertest (Prisma mocked; no DB needed)
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

Schema changes now go through **Prisma Migrate** (migration files under `backend/prisma/migrations/`), not `db push`. CI runs `prisma migrate deploy`. There ARE test suites (backend Vitest, frontend Vitest, gated Playwright e2e in `e2e/`); keep them green. Health: `GET /api/hello`; readiness (`SELECT 1`): `GET /api/ready`. Interactive API docs at `GET /api/docs` (OpenAPI JSON at `GET /api/openapi.json`).

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
- Refresh token: opaque random string stored in the `RefreshToken` table, 7-day expiry, **rotated** on every `/api/auth/refresh-token`.
- Middleware in `src/middleware/authMiddleware.js`: `authenticateUser`, `optionalAuthenticate` (never fails), `authorizeRoles(...roles)`.
- Login lockout: 5 failed attempts → 15-min lock (`failedLoginAttempts`/`lockUntil` on User). Login is rate-limited (`src/middleware/rateLimiter.js`).
- `tokenVersion` (on User) is carried in the access-token payload and checked against the DB by the middleware — a password/role change or account delete bumps it to invalidate live tokens. A soft-deleted user (`User.deletedAt` set, AUTH-04) is treated as nonexistent everywhere.
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

**Graceful degradation:** Razorpay and email are optional. If `RAZORPAY_KEY_*` is unset, order/verify/refund endpoints 503/demo and the frontend uses a demo flow. If SMTP is unset, emails are skipped and signup auto-verifies. Design new payment/email code the same way.

### API response conventions (unified — ARCH-01)
All routes now emit the same envelope via `res.ok(data, {status,message})` / `res.fail(status, code, message, details?)` (`src/middleware/respond.js`): `{ success, data, error: { code, message, details? }, requestId }`. Every route is served under both `/api/v1/*` (preferred) and `/api/*` (deprecation alias, ARCH-04) — mount new routers in the `index.js` loop so both work.

### Frontend
- App Router under `frontend/app/`. Path alias `@/*` → project root (e.g. `@/lib/auth`, `@/components/...`).
- **All** backend calls must go through `getApiUrl()` from `@/lib/auth` (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000`) — never hardcode `http://localhost:4000`.
- Route areas: public (`fests`, `events/[id]/{booking,payment}`, `sponsor`), auth (`signin`/`signup`/`forgot`/`reset`), `admin/*` (scoped by `managedFestId`), `host/*` (scoped by `editorFestId`). Admin/host UI components live in `components/admin/`, `components/event-create/`, `components/payment/`.

## Gotchas & conventions
- **ESM backend:** `"type": "module"`; relative imports need explicit `.js` extensions.
- **Prisma client IS a shared singleton** now (ARCH-06): import the default export of `backend/src/prisma.js` (`import prisma from "../prisma.js"`). Do NOT `new PrismaClient()` in route files. Tests mock `@prisma/client` via `backend/__mocks__/@prisma/client.js` (`prismaMock`); add new models to its `MODEL_KEYS`.
- **Schema changes** go through Prisma Migrate: edit `schema.prisma`, `npm run migrate:dev` to generate + apply a migration under `prisma/migrations/`. Datasource is `postgresql` with a pooled `url` (`DATABASE_URL`) + unpooled `directUrl` (`DIRECT_URL`, required to exist even locally). The old `db.js` and `dev.db` are gone.
- **Database is PostgreSQL** (Neon in prod), `DATABASE_URL` in `backend/.env`. `.env.example` documents all runtime env: `PORT`, `FRONTEND_URL` (CORS), `PUBLIC_API_URL` (email links), `JWT_SECRET`, `DATABASE_URL`/`DIRECT_URL`, `RAZORPAY_KEY_*`/`RAZORPAY_WEBHOOK_SECRET`, `SMTP_*`/`MAIL_FROM`.
- **Structured logging** (ARCH-09): use `req.log` (pino child bound to `requestId`) in handlers, not `console.log`. Throw `AppError`/`bookingError` for typed errors; the central handler in `index.js` maps them.
- `IMPROVEMENTS-PLAN.md` is the phased roadmap (Phases 1–3 done); `PENDING-TASKS.md` is the older backlog. Check both before adding features.
