# tiqr

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

The database is **PostgreSQL** (Neon in production), configured via `DATABASE_URL` in `backend/.env` — the app refuses to start if it is unset. There are no migration files; the schema in `backend/prisma/schema.prisma` is applied directly. From `backend`, run `npx prisma db push` to sync the schema to your database (and `npx prisma generate` after any schema change). Use `npx prisma studio` to inspect/edit data. (A stale `backend/prisma/dev.db` SQLite file may still be present in the repo; it is unused.)

See `backend/SETUP-CHECKLIST.md` for admin/editor setup (fest keys, approval script).

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
  This needs a running Postgres with `DATABASE_URL` set and the schema pushed (`cd backend && npx prisma db push`). Playwright boots both dev servers itself. In CI the e2e job spins up a throwaway Postgres 16 service container and is marked `continue-on-error` so a flaky run does not block the build.
