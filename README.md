# FesTicket

Event ticketing and booking app: fests, events, tickets, admin and host dashboards.

## After cloning – get it running

The code is environment-agnostic (no hardcoded machine paths). You only need to set up env and install deps.

1. **Backend env**  
   From repo root:
   ```bash
   cd backend
   cp .env.example .env
   ```
   Edit `backend/.env` and set at least:
   - `JWT_SECRET` – any long random string (e.g. 32+ chars). Required for auth.
   - For **real payments**: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (get test keys from [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys, Test mode). If these are unset, the payment page uses a demo flow (no real charge).

   Defaults in `.env.example` (PORT=4000, FRONTEND_URL=http://localhost:3000) work for local dev.

2. **Install and generate**
   ```bash
   # Backend
   cd backend
   npm install
   npx prisma generate
   npx prisma migrate deploy   # apply migrations to your database (schema + CHECK constraints)
   npm run dev
   ```
   In another terminal:
   ```bash
   # Frontend
   cd frontend
   npm install
   npm run dev
   ```

3. **Open**  
   - App: [http://localhost:3000](http://localhost:3000)  
   - API: [http://localhost:4000](http://localhost:4000)

Frontend talks to the backend via `getApiUrl()` (defaults to `http://localhost:4000`). To use another backend (e.g. deployed API), set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`. For Razorpay Checkout (real payments), set `NEXT_PUBLIC_RAZORPAY_KEY_ID` in `frontend/.env.local` to the same Key ID as the backend (optional; the backend can also return it when creating an order).

The database is **PostgreSQL** (Neon in production), configured via `DATABASE_URL` in `backend/.env` — the app refuses to start if it is unset. When a pooled connection is used (e.g. Neon's PgBouncer), also set `DIRECT_URL` to the unpooled connection string; Prisma uses it for migrations and schema introspection. From `backend`:

- **Apply the schema** to a database with `npx prisma migrate deploy` (production/CI) — it runs the committed migrations under `backend/prisma/migrations/`, including the folded CHECK constraints (inventory `sold <= quantity`, non-negative money).
- **Change the schema:** edit `backend/prisma/schema.prisma`, then `npm run migrate:dev` (`prisma migrate dev`) to generate a new migration and apply it locally. Run `npx prisma generate` after any schema change so `@prisma/client` matches.
- Check state with `npm run migrate:status`, and inspect/edit data with `npx prisma studio`.

See `backend/SETUP-CHECKLIST.md` for admin/editor setup (fest keys, approval script).

## API

Every endpoint is served under both `/api/v1/*` (preferred) and `/api/*` (a deprecation alias with identical behaviour). Auth is a bearer JWT (15-min access token from `POST /api/v1/auth/signin`).

The contract is documented with OpenAPI 3.0 — request bodies are generated from the same zod validators the routes enforce, so the docs never drift:

- **`GET /api/docs`** — interactive Swagger UI (no auth).
- **`GET /api/openapi.json`** — the raw OpenAPI 3.0 document.

## Testing & CI

Automated on every push and pull request via GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

- **Backend** (from `backend/`): `npm test` runs the Vitest + supertest suite. Prisma is mocked (`backend/__mocks__/@prisma/client.js`), so **no database is required**. Run `npx prisma generate` first on a fresh clone so `@prisma/client` resolves.
- **Frontend** (from `frontend/`): `npm run lint` (ESLint flat config), `npm test` (Vitest + React Testing Library), and `npx tsc --noEmit` (typecheck).
- **End-to-end** (from `e2e/`): Playwright drives the real frontend + backend together. The journey specs self-skip unless a database is available, so enable them with `E2E_HAS_DB=1`:
  ```bash
  cd e2e
  npm install
  npx playwright install --with-deps chromium
  E2E_HAS_DB=1 npx playwright test
  ```
  This needs a running Postgres with `DATABASE_URL` set and the schema applied (`cd backend && npx prisma migrate deploy`). Playwright boots both dev servers itself. In CI the e2e job spins up a throwaway Postgres 16 service container and is marked `continue-on-error` so a flaky run does not block the build.
