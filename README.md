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

The SQLite DB (`backend/prisma/dev.db`) is in the repo, so you get the current schema and any committed data. To reset the DB: from `backend`, run `npx prisma db push` (or migrate).

See `backend/SETUP-CHECKLIST.md` for admin/editor setup (fest keys, approval script).
